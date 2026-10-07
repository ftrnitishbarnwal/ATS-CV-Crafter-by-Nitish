/**
 * Resume generation pipeline. Each stage is reported as it actually completes (no fake delays).
 */
import type { ProfileInput, GenerationResult, GuardNote, Resume, PageSize, JdAnalysis } from "../../shared/types";
import { analyzeJd } from "../../shared/jd-analyzer";
import { buildResume, experienceSourceBullets, projectSourceBullets, polishBullet, alignText, generateLocalSummary } from "../../shared/optimizer";
import { scoreResume } from "../../shared/scoring";
import { buildGuardContext, checkText } from "../../shared/guard";
import { profileCorpus } from "../../shared/resume-text";
import { totalYears } from "../../shared/dates";
import { validateJd, validateProfileForGeneration } from "../../shared/validation";
import { uniqueCaseInsensitive, normalizeSpace } from "../../shared/util";
import { getAiProvider } from "./ai";
import type { OptimizeInput } from "./ai/types";
import { renderResumePdf } from "./pdf";
import { UserError } from "../http";
import { log, errorClass } from "../logger";

export type StageReporter = (index: number, status: "active" | "done") => void;

/** Trim every string field so oversized input can't blow up rendering or AI prompts. */
export function sanitizeProfile(p: ProfileInput): ProfileInput {
  const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
  const s = (v: unknown) => cut(v, 300);
  const l = (v: unknown) => cut(v, 6000);
  const arr = <T>(v: unknown, n = 20): T[] => (Array.isArray(v) ? (v.slice(0, n) as T[]) : []);
  const src = (p ?? {}) as Partial<ProfileInput>;
  const c = (src.contact ?? {}) as Partial<ProfileInput["contact"]>;
  const add = (src.additional ?? {}) as Partial<ProfileInput["additional"]>;
  const sk = (src.skills ?? {}) as Partial<ProfileInput["skills"]>;
  return {
    contact: {
      fullName: s(c.fullName), title: s(c.title), email: s(c.email), phone: s(c.phone), location: s(c.location),
      linkedin: s(c.linkedin), github: s(c.github), portfolio: s(c.portfolio), otherLinks: arr<string>(c.otherLinks, 5).map(s),
    },
    summary: cut(src.summary, 2000),
    autoSummary: src.autoSummary !== false,
    experience: arr<ProfileInput["experience"][number]>(src.experience).map((e) => ({
      id: s(e?.id) || `exp_${Math.random().toString(36).slice(2, 8)}`, company: s(e?.company), title: s(e?.title), location: s(e?.location),
      startDate: s(e?.startDate), endDate: s(e?.endDate), current: e?.current === true,
      responsibilities: l(e?.responsibilities), achievements: l(e?.achievements), results: l(e?.results), technologies: cut(e?.technologies, 1000),
    })),
    education: arr<ProfileInput["education"][number]>(src.education).map((e) => ({
      id: s(e?.id) || `edu_${Math.random().toString(36).slice(2, 8)}`, degree: s(e?.degree), institution: s(e?.institution), location: s(e?.location),
      startYear: s(e?.startYear), endYear: s(e?.endYear), grade: s(e?.grade), coursework: cut(e?.coursework, 1000),
    })),
    skills: {
      technical: l(sk.technical), languages: l(sk.languages), frameworks: l(sk.frameworks), tools: l(sk.tools), platforms: l(sk.platforms),
      domain: l(sk.domain), soft: l(sk.soft),
      other: arr<ProfileInput["skills"]["other"][number]>(sk.other).map((o) => ({ id: s(o?.id) || "sk", category: s(o?.category), items: cut(o?.items, 2000) })),
    },
    projects: arr<ProfileInput["projects"][number]>(src.projects).map((x) => ({
      id: s(x?.id) || `prj_${Math.random().toString(36).slice(2, 8)}`, name: s(x?.name), description: cut(x?.description, 2000),
      technologies: cut(x?.technologies, 1000), responsibilities: l(x?.responsibilities), outcomes: l(x?.outcomes), link: s(x?.link),
    })),
    certifications: arr<ProfileInput["certifications"][number]>(src.certifications).map((x) => ({
      id: s(x?.id) || `cert_${Math.random().toString(36).slice(2, 8)}`, name: s(x?.name), issuer: s(x?.issuer), date: s(x?.date),
      credentialId: s(x?.credentialId), url: s(x?.url),
    })),
    achievements: l(src.achievements),
    additional: {
      Languages: l(add.Languages), "Volunteer Experience": l(add["Volunteer Experience"]), Publications: l(add.Publications),
      Conferences: l(add.Conferences), "Professional Memberships": l(add["Professional Memberships"]), Interests: l(add.Interests),
    },
  };
}

function optimizeInput(profile: ProfileInput, jd: JdAnalysis, jdText: string, resume: Resume): OptimizeInput {
  return {
    jd,
    jdText,
    profile,
    experienceSources: profile.experience
      .filter((e) => e.title || e.company)
      .map((e) => ({ id: e.id, title: e.title, company: e.company, current: e.current, bullets: experienceSourceBullets(e), technologies: e.technologies.split(/,\s*/).filter(Boolean) })),
    projectSources: profile.projects.filter((p) => p.name).map((p) => ({ id: p.id, name: p.name, bullets: projectSourceBullets(p), technologies: p.technologies.split(/,\s*/).filter(Boolean) })),
    skills: resume.skills.flatMap((g) => g.items),
    yearsOfExperience: totalYears(profile.experience),
  };
}

/** Apply guarded AI rewrites on top of the locally built resume. */
async function applyAi(profile: ProfileInput, jd: JdAnalysis, jdText: string, resume: Resume, notes: GuardNote[]): Promise<{ accepted: number; rejected: number }> {
  const provider = getAiProvider();
  if (!provider) throw new Error("no provider");
  const input = optimizeInput(profile, jd, jdText, resume);
  const out = await provider.optimize(input);
  const ctx = buildGuardContext(profileCorpus(profile));
  const years = input.yearsOfExperience;
  let accepted = 0;
  let rejected = 0;

  const merge = (label: string, sources: string[], aiBullets: { text: string; sources: number[] }[] | undefined): string[] | null => {
    if (!aiBullets || !aiBullets.length || !sources.length) return null;
    const used = new Set<number>();
    const result: string[] = [];
    for (const b of aiBullets.slice(0, sources.length + 2)) {
      const idx = (Array.isArray(b.sources) ? b.sources : []).filter((i) => Number.isInteger(i) && i >= 0 && i < sources.length);
      const local = (idx.length ? idx.map((i) => sources[i]) : sources).join(" ");
      const text = normalizeSpace(String(b.text ?? "")).replace(/[.;]+$/, "");
      const verdict = checkText(text, ctx, local);
      if (verdict.ok && idx.length) {
        result.push(alignText(text.replace(/^./, (ch) => ch.toUpperCase()), jd));
        idx.forEach((i) => used.add(i));
        accepted++;
      } else {
        rejected++;
        notes.push({ location: label, reason: verdict.reason ?? "couldn't be matched to your original bullet" });
        if (idx[0] != null && !used.has(idx[0])) {
          result.push(polishBullet(sources[idx[0]], jd));
          used.add(idx[0]);
        }
      }
    }
    // Never silently drop the user's information.
    sources.forEach((s, i) => {
      if (!used.has(i)) result.push(polishBullet(s, jd));
    });
    return uniqueCaseInsensitive(result);
  };

  for (const exp of resume.experience) {
    const src = input.experienceSources.find((e) => e.id === exp.id);
    const ai = out.experience.find((e) => e?.id === exp.id);
    if (!src) continue;
    const merged = merge(`${exp.title || "Role"} at ${exp.company || "company"}`, src.bullets, ai?.bullets);
    if (merged) exp.bullets = merged;
  }
  for (const prj of resume.projects) {
    const src = input.projectSources.find((p) => p.id === prj.id);
    const ai = out.projects.find((p) => p?.id === prj.id);
    if (!src) continue;
    const merged = merge(`Project "${prj.name}"`, src.bullets, ai?.bullets);
    if (merged) prj.bullets = merged;
  }

  const keepUserSummary = !profile.autoSummary && profile.summary.trim();
  if (!keepUserSummary && out.summary?.trim()) {
    const sum = normalizeSpace(out.summary);
    const verdict = checkText(sum, ctx, "", [String(Math.floor(years)), `${Math.floor(years)}+`, String(Math.round(years))]);
    if (verdict.ok && sum.split(/\s+/).length <= 110) {
      resume.summary = alignText(sum, jd);
      accepted++;
    } else {
      rejected++;
      notes.push({ location: "Summary", reason: verdict.reason ?? "too long" });
    }
  }
  return { accepted, rejected };
}

export async function generate(rawProfile: ProfileInput, jdText: string, report: StageReporter, pageSize: PageSize = "A4"): Promise<GenerationResult> {
  // 1. Reading your information
  report(0, "active");
  const jdError = validateJd(jdText);
  if (jdError) throw new UserError(400, jdError, "invalid_jd");
  const profile = sanitizeProfile(rawProfile);
  const { message } = validateProfileForGeneration(profile);
  if (message) throw new UserError(400, message, "invalid_profile");
  report(0, "done");

  // 2–3. Analyze the JD and identify keywords
  report(1, "active");
  const jd = analyzeJd(jdText);
  report(1, "done");
  report(2, "active");
  if (!jd.keywords.length) log.warn("jd_no_keywords");
  report(2, "done");

  // 4. Match experience (baseline = the user's material as-is)
  report(3, "active");
  const baselineResume = buildResume(profile, jd, { rewrite: false }).resume;
  const baseline = scoreResume(baselineResume, jd);
  report(3, "done");

  // 5. Structure (local deterministic optimization)
  report(4, "active");
  const { resume, changes } = buildResume(profile, jd, { rewrite: true });
  report(4, "done");

  // 6. Improve bullets (AI when configured, guarded; otherwise the local engine's rewrite stands)
  report(5, "active");
  const guardNotes: GuardNote[] = [];
  let engine: "ai" | "local" = "local";
  let engineNotice: string | null = null;
  if (getAiProvider()) {
    try {
      const { rejected } = await applyAi(profile, jd, jdText, resume, guardNotes);
      engine = "ai";
      changes.unshift("Rewrote your summary and bullets for this job with AI, then verified every claim against your information.");
      if (rejected) changes.push(`Discarded ${rejected} AI suggestion${rejected > 1 ? "s" : ""} that contained details not found in your information.`);
    } catch (e) {
      log.warn("ai_optimize_failed", { error: errorClass(e) });
      engineNotice = "Our AI writing service didn't respond, so your resume was optimized with our built-in rules engine. You can regenerate later to try AI again.";
    }
  }
  report(5, "done");

  // 7. ATS compatibility check
  report(6, "active");
  let result = scoreResume(resume, jd);
  report(6, "done");

  // 8. Formatting: render the real PDF to measure length
  report(7, "active");
  let pageCount = 1;
  try {
    pageCount = (await renderResumePdf(resume, pageSize)).pageCount;
    result = scoreResume(resume, jd, { pageCount });
  } catch (e) {
    log.error("pdf_measure_failed", { error: errorClass(e) });
  }
  report(7, "done");

  // 9. Final quality checks
  report(8, "active");
  for (const e of resume.experience) e.bullets = e.bullets.filter((b) => b.trim().length > 1);
  if (!resume.summary.trim()) resume.summary = generateLocalSummary(profile, jd, resume.skills.flatMap((g) => g.items), resume.experience);
  report(8, "done");

  return { resume, jd, report: result, baseline, engine, engineNotice, guardNotes, changes, pageCount };
}

export async function generateSummary(rawProfile: ProfileInput, jdText: string): Promise<{ summary: string; engine: "ai" | "local"; notice: string | null }> {
  const profile = sanitizeProfile(rawProfile);
  const jd = analyzeJd(jdText || "");
  const { resume } = buildResume({ ...profile, summary: "", autoSummary: true }, jd, { rewrite: true });
  const local = generateLocalSummary(profile, jd, resume.skills.flatMap((g) => g.items), resume.experience);
  const provider = getAiProvider();
  if (!provider) return { summary: local, engine: "local", notice: null };
  try {
    const s = normalizeSpace(await provider.summarize(optimizeInput(profile, jd, jdText, resume)));
    const years = totalYears(profile.experience);
    const verdict = checkText(s, buildGuardContext(profileCorpus(profile)), "", [String(Math.floor(years)), `${Math.floor(years)}+`]);
    if (verdict.ok) return { summary: s, engine: "ai", notice: null };
    return { summary: local, engine: "local", notice: "The AI draft included details we couldn't verify, so we wrote this summary from your information instead." };
  } catch (e) {
    log.warn("ai_summary_failed", { error: errorClass(e) });
    return { summary: local, engine: "local", notice: null };
  }
}
