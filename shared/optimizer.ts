/**
 * Local (deterministic) resume optimization engine.
 * Rewrites and reorders what the user provided. It never adds companies, titles, dates,
 * degrees, certifications, metrics or skills that are not already in the user's material.
 */
import type { ProfileInput, JdAnalysis, Resume, ResumeSkillGroup, ResumeExperience, ResumeProject, SectionKey, ResumeSection } from "./types";
import { ADDITIONAL_KINDS } from "./types";
import { splitLines, splitList, uniqueCaseInsensitive, normalizeSpace, hasMetric, wordCount, uid, escapeRegex } from "./util";
import { strengthenOpening, startsWithStrongVerb } from "./verbs";
import { findTerms, textHasTerm, lookupTerm, entryByKey } from "./skills-dictionary";
import { recencyKey, totalYears } from "./dates";
import { profileCorpus } from "./resume-text";

/* ---------------------- Terminology alignment (safe) --------------------- */

/** Canonical keys whose aliases are true equivalents (spelling variants / expansions). */
const EQUIVALENT_KEYS = new Set([
  "javascript", "typescript", "react", "next.js", "vue.js", "nuxt.js", "node.js", "express.js", "postgresql", "mongodb", "kubernetes", "go",
  "aws", "gcp", "azure", "ci/cd", "machine learning", "natural language processing", "large language models", "generative ai",
  "scikit-learn", "c#", "c++", "excel", "power bi", "seo", "sem", "ppc", "crm", "kpis", "a/b testing", "rest",
  "object-oriented programming", "tdd", "ui/ux", "rest apis", "sql server", "bigquery", "redshift", "tailwind css", "material ui", "d3.js",
  "e-commerce", "go-to-market", "fp&a", "financial modeling", "data visualization", "data modeling", "problem solving",
  "microservices", "dashboards", "html", "css", "sass", "pytest", "hugging face", "fastapi", "github actions", "gitlab ci",
  "infrastructure as code", "power automate", "google analytics", "google ads", "meta ads", "vs code", "ms teams",
  "microsoft teams", "google workspace",
  "user research", "ux design", "ui design", "wireframing", "prototyping", "design systems", "accessibility", "usability testing",
  "data analysis", "statistics", "etl", "data warehousing", "data pipelines", "business intelligence", "code review", "api design",
  "customer service", "account management", "recruitment", "learning and development", "supply chain management",
  "process improvement", "stakeholder management", "cross-functional collaboration", "collaboration", "decision making",
]);

interface Alignment {
  from: RegExp;
  to: string;
  label: string;
}

export function buildAlignments(jd: JdAnalysis): Alignment[] {
  const out: Alignment[] = [];
  for (const k of jd.keywords) {
    const entry = entryByKey(k.canonical);
    if (!entry || !EQUIVALENT_KEYS.has(entry.key)) continue;
    const variants = [entry.canonical, ...entry.aliases].filter((v) => v.toLowerCase() !== k.term.toLowerCase());
    for (const v of variants) {
      // Skip short/ambiguous variants and variants contained in the target (e.g. "REST" inside "RESTful APIs").
      if (v.length <= 2 && !/^(js|ts|ml)$/i.test(v)) continue;
      if (k.term.toLowerCase().includes(v.toLowerCase()) || v.toLowerCase().includes(k.term.toLowerCase())) continue;
      const esc = escapeRegex(v).replace(/\s+/g, "[\\s-]+");
      out.push({ from: new RegExp(`(?<![A-Za-z0-9+#.])${esc}(?![A-Za-z0-9+#])`, v.length <= 3 ? "g" : "gi"), to: k.term, label: `${v} → ${k.term}` });
    }
  }
  return out;
}

export function applyAlignments(text: string, aligns: Alignment[], used?: Set<string>): string {
  let t = text;
  for (const a of aligns) {
    a.from.lastIndex = 0;
    if (a.from.test(t)) {
      a.from.lastIndex = 0;
      const norm = (x: string) => x.toLowerCase().replace(/[\s-]+/g, " ");
      t = t.replace(a.from, (m) => {
        if (norm(m) === norm(a.to)) return m; // same term, different case/hyphenation: keep the user's text
        used?.add(a.label);
        return a.to;
      });
    }
  }
  return t;
}

/* ------------------------------- Helpers ------------------------------- */

/** Terms that are real keywords but read oddly as standalone skills; they still count when used in bullets. */
const GENERIC_TERMS = new Set([
  "dashboards", "reporting", "kpis", "research", "training", "documentation", "onboarding", "sales", "retail", "healthcare",
  "manufacturing", "teaching", "retention", "monitoring", "caching", "concurrency", "scalability", "architecture", "security best practices",
  "backend development", "frontend development", "full stack development", "mobile development", "web development", "b2b", "b2c", "saas",
  "e-commerce", "api design", "version control", "code review", "social media", "editing",
]);

function jdHits(text: string, jd: JdAnalysis): number {
  let n = 0;
  for (const k of jd.keywords) {
    if (k.kind === "domain") {
      if (phraseInText(k.term, text)) n++;
    } else if (textHasTerm(text, k.canonical)) n += k.importance === "required" ? 1 : 0.5;
  }
  return n;
}

export function phraseInText(phrase: string, text: string): boolean {
  const words = phrase.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return false;
  const lower = text.toLowerCase();
  return words.every((w) => {
    const stem = w.length > 5 ? w.slice(0, w.length - 2) : w.replace(/s$/, "");
    return new RegExp(`\\b${escapeRegex(stem)}`, "i").test(lower);
  });
}

function bulletScore(b: string, jd: JdAnalysis): number {
  return jdHits(b, jd) * 2.5 + (hasMetric(b) ? 3 : 0) + (startsWithStrongVerb(b) ? 0.5 : 0);
}

function stableSortBy<T>(items: T[], score: (t: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

function cleanBullet(b: string): string {
  return normalizeSpace(b)
    .replace(/^[-–—•*·\s]+/, "")
    .replace(/[.;,\s]+$/, "")
    .replace(/^./, (c) => c.toUpperCase());
}

const SKILL_FIELDS: [keyof Omit<ProfileInput["skills"], "other">, string][] = [
  ["languages", "Programming Languages"],
  ["frameworks", "Frameworks & Libraries"],
  ["technical", "Technical Skills"],
  ["tools", "Tools"],
  ["platforms", "Platforms & Cloud"],
  ["domain", "Domain Expertise"],
  ["soft", "Soft Skills"],
];

const CATEGORY_TO_GROUP: Record<string, string> = {
  "Programming Languages": "Programming Languages",
  "Frameworks & Libraries": "Frameworks & Libraries",
  Databases: "Technical Skills",
  "Cloud & DevOps": "Platforms & Cloud",
  "Tools & Platforms": "Tools",
  "Soft Skills": "Soft Skills",
};

/* -------------------------------- Summary ------------------------------- */

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function generateLocalSummary(profile: ProfileInput, jd: JdAnalysis, resumeSkills: string[], experience: ResumeExperience[]): string {
  const years = totalYears(profile.experience);
  const recent = experience[0];
  const title = normalizeSpace(profile.contact.title) || recent?.title || "";
  const edu = profile.education[0];
  const corpus = profileCorpus(profile);

  // Skills the user has, JD-relevant first (soft skills excluded from the lead sentence)
  const hard = resumeSkills.filter((s) => lookupTerm(s)?.kind !== "soft");
  const kwIndex = (s: string) => jd.keywords.findIndex((k) => k.kind !== "domain" && (k.term.toLowerCase() === s.toLowerCase() || lookupTerm(s)?.key === k.canonical));
  const matched = hard.filter((s) => kwIndex(s) >= 0).sort((a, b) => kwIndex(a) - kwIndex(b));
  const lead = uniqueCaseInsensitive([...matched, ...hard]).slice(0, 3);
  const more = uniqueCaseInsensitive([...matched, ...hard]).slice(3, 7);

  const sentences: string[] = [];
  const who = title ? title.replace(/^./, (c) => c.toUpperCase()) : edu?.degree ? `${edu.degree} graduate` : "Professional";
  if (years >= 1) {
    const y = Math.floor(years);
    sentences.push(`${who} with ${y}+ year${y === 1 ? "" : "s"} of experience${lead.length ? ` in ${joinList(lead)}` : ""}.`);
  } else if (lead.length) {
    sentences.push(`${who} with hands-on experience in ${joinList(lead)}.`);
  } else {
    sentences.push(`${who}.`);
  }

  // Strongest quantified achievement from the most recent roles (verbatim content, framed as a clause).
  const highlight = experience
    .slice(0, 2)
    .flatMap((e) => e.bullets.map((b) => ({ e, b })))
    .find(({ b }) => hasMetric(b) && wordCount(b) <= 28);
  if (highlight && highlight.e.company) {
    const clause = highlight.b.charAt(0).toLowerCase() + highlight.b.slice(1);
    sentences.push(`At ${highlight.e.company}, ${clause}.`);
  } else if (!experience.length && edu?.institution && edu.degree) {
    sentences.push(`Holds a ${edu.degree} from ${edu.institution}${edu.grade ? ` (${edu.grade})` : ""}.`);
  }

  if (more.length >= 2) sentences.push(`Also skilled in ${joinList(more)}.`);

  const soft = resumeSkills.filter((s) => lookupTerm(s)?.kind === "soft" && textHasTerm(corpus, lookupTerm(s)!.key)).slice(0, 2);
  if (soft.length && sentences.length < 4) sentences.push(`Known for ${joinList(soft.map((s) => s.toLowerCase()))}.`);

  return sentences.join(" ");
}

function cleanUserSummary(s: string): string {
  return normalizeSpace(s)
    .replace(/^(?:i\s+am|i'm)\s+(?:an?\s+)?/i, "")
    .replace(/\bI\s+(have|am|bring|enjoy|love|specialize|build|lead|work)\b/g, (_m, v: string) => v)
    .replace(/^./, (c) => c.toUpperCase());
}

/** Keep the user's summary; if it's brief, append a factual line naming JD-relevant skills they already list. */
function augmentSummary(summary: string, jd: JdAnalysis, skills: string[]): { text: string; added: boolean } {
  if (wordCount(summary) >= 45) return { text: summary, added: false };
  const relevant = skills.filter(
    (s) => lookupTerm(s)?.kind !== "soft" && !["Engineering Practices", "Methodologies"].includes(lookupTerm(s)?.category ?? "") && jd.keywords.some((k) => k.kind !== "domain" && (k.term.toLowerCase() === s.toLowerCase() || lookupTerm(s)?.key === k.canonical)),
  );
  const missingFromSummary = relevant.filter((s) => !textHasTerm(summary, lookupTerm(s)?.key ?? s.toLowerCase()));
  if (missingFromSummary.length < 2) return { text: summary, added: false };
  const base = /[.!?]$/.test(summary) ? summary : summary + ".";
  return { text: `${base} Skilled in ${joinList(missingFromSummary.slice(0, 5))}.`, added: true };
}

/* ------------------------------ Main build ------------------------------ */

export interface BuildOptions {
  /** When false, bullets keep the user's wording (used for baseline scoring of the original). */
  rewrite: boolean;
}

export interface BuildResult {
  resume: Resume;
  changes: string[];
}

export function buildResume(profile: ProfileInput, jd: JdAnalysis, opts: BuildOptions = { rewrite: true }): BuildResult {
  const changes: string[] = [];
  const aligns = opts.rewrite ? buildAlignments(jd) : [];
  const alignedLabels = new Set<string>();
  const align = (t: string) => (opts.rewrite ? applyAlignments(t, aligns, alignedLabels) : t);
  let rewrittenCount = 0;
  let reordered = false;

  /* Experience */
  const experience: ResumeExperience[] = profile.experience
    .filter((e) => e.title || e.company || e.responsibilities || e.achievements || e.results)
    .map((e) => {
      const rawBullets = uniqueCaseInsensitive([...splitLines(e.responsibilities), ...splitLines(e.achievements), ...splitLines(e.results)]);
      let bullets = rawBullets.map((b) => {
        if (!opts.rewrite) return cleanBullet(b);
        const r = strengthenOpening(b, "past");
        if (r.changed) rewrittenCount++;
        return align(cleanBullet(r.text));
      });
      bullets = uniqueCaseInsensitive(bullets);
      if (opts.rewrite) {
        const sorted = stableSortBy(bullets, (b) => bulletScore(b, jd));
        if (sorted.some((b, i) => b !== bullets[i])) reordered = true;
        bullets = sorted;
      }
      return {
        id: e.id,
        company: normalizeSpace(e.company),
        title: normalizeSpace(e.title),
        location: normalizeSpace(e.location),
        startDate: e.startDate,
        endDate: e.current ? "" : e.endDate,
        current: e.current,
        bullets,
        technologies: uniqueCaseInsensitive(splitList(e.technologies).map(align)),
      };
    });
  const sortedExp = [...experience].sort((a, b) => recencyKey(b) - recencyKey(a));

  /* Projects */
  const projects: ResumeProject[] = profile.projects
    .filter((p) => p.name || p.responsibilities || p.description)
    .map((p) => {
      const lines = uniqueCaseInsensitive([...(p.description ? [p.description] : []), ...splitLines(p.responsibilities), ...splitLines(p.outcomes)]);
      let bullets = lines.map((b) => {
        if (!opts.rewrite) return cleanBullet(b);
        const r = strengthenOpening(b, "past");
        if (r.changed) rewrittenCount++;
        return align(cleanBullet(r.text));
      });
      bullets = uniqueCaseInsensitive(bullets);
      return {
        id: p.id,
        name: normalizeSpace(p.name),
        link: normalizeSpace(p.link),
        technologies: uniqueCaseInsensitive(splitList(p.technologies).map(align)),
        bullets,
      };
    });
  const sortedProjects = opts.rewrite ? stableSortBy(projects, (p) => jdHits([p.name, ...p.bullets, ...p.technologies].join(" "), jd)) : projects;

  /* Skills */
  const groups: ResumeSkillGroup[] = [];
  const addGroup = (category: string, items: string[]) => {
    const clean = uniqueCaseInsensitive(items.map((i) => align(i)));
    if (!clean.length) return;
    const existing = groups.find((g) => g.category.toLowerCase() === category.toLowerCase());
    if (existing) existing.items = uniqueCaseInsensitive([...existing.items, ...clean]);
    else groups.push({ id: uid("sg"), category, items: clean });
  };
  for (const [field, label] of SKILL_FIELDS) addGroup(label, splitList(profile.skills[field]));
  for (const o of profile.skills.other) addGroup(normalizeSpace(o.category) || "Skills", splitList(o.items));

  // Evidence-based skills: JD skills the user demonstrably used (in bullets/tech/projects) but didn't list.
  if (opts.rewrite) {
    const evidenceText = [
      ...sortedExp.flatMap((e) => [...e.bullets, ...e.technologies]),
      ...sortedProjects.flatMap((p) => [...p.bullets, ...p.technologies]),
    ].join("\n");
    const listed = groups.flatMap((g) => g.items).join(", ");
    const added: string[] = [];
    for (const k of jd.keywords) {
      if (k.kind === "domain" || k.kind === "soft") continue;
      const entry = entryByKey(k.canonical);
      if (!entry || GENERIC_TERMS.has(entry.key)) continue;
      if (textHasTerm(listed, entry.key)) continue;
      if (!textHasTerm(evidenceText, entry.key)) continue;
      const hit = findTerms(evidenceText).find((h) => h.entry.key === entry.key);
      const display = entry.canonical;
      void hit;
      const target = CATEGORY_TO_GROUP[entry.category] ?? "Technical Skills";
      const group = groups.find((g) => g.category === target) ?? groups.find((g) => !/soft/i.test(g.category) && g.category !== "Programming Languages");
      if (group) group.items.push(display);
      else addGroup(target === "Soft Skills" ? "Technical Skills" : target, [display]);
      added.push(display);
    }
    if (added.length) changes.push(`Added ${added.length} skill${added.length > 1 ? "s" : ""} you already demonstrate in your experience to the Skills section: ${added.join(", ")}.`);

    // JD-relevant skills first inside each group; groups with more matches first; soft skills last.
    const isMatch = (s: string) => jd.keywords.some((k) => k.kind !== "domain" && (k.term.toLowerCase() === s.toLowerCase() || lookupTerm(s)?.key === k.canonical));
    for (const g of groups) g.items = stableSortBy(g.items, (s) => (isMatch(s) ? 1 : 0));
    // Conventional group order; custom groups follow by relevance; soft skills last.
    const ORDER = ["Programming Languages", "Frameworks & Libraries", "Technical Skills", "Platforms & Cloud", "Tools", "Domain Expertise"];
    const sortedGroups = stableSortBy(groups, (g) => {
      if (/soft/i.test(g.category)) return -1000;
      const i = ORDER.indexOf(g.category);
      return i >= 0 ? 100 - i : g.items.filter(isMatch).length;
    });
    groups.splice(0, groups.length, ...sortedGroups);
  }

  /* Summary */
  const allSkills = groups.flatMap((g) => g.items);
  let summary = "";
  if (!opts.rewrite) {
    summary = normalizeSpace(profile.summary);
  } else if (!profile.autoSummary && profile.summary.trim()) {
    // The user wrote their own summary and chose to keep it: light cleanup only.
    summary = align(cleanUserSummary(profile.summary));
  } else if (profile.summary.trim()) {
    summary = align(cleanUserSummary(profile.summary));
    const aug = augmentSummary(summary, jd, allSkills);
    if (aug.added) {
      summary = aug.text;
      changes.push("Kept your summary and added the job-relevant skills you already list.");
    }
  } else {
    summary = generateLocalSummary(profile, jd, allSkills, sortedExp);
    if (summary) changes.push("Wrote a professional summary from your own experience and skills.");
  }

  /* Education, certifications, achievements, additional */
  const education = profile.education
    .filter((e) => e.degree || e.institution)
    .map((e) => ({ ...e, degree: normalizeSpace(e.degree), institution: normalizeSpace(e.institution), coursework: normalizeSpace(e.coursework), grade: normalizeSpace(e.grade) }))
    .sort((a, b) => (parseInt(b.endYear) || 9999) - (parseInt(a.endYear) || 9999));
  const certifications = profile.certifications.filter((c) => c.name.trim()).map((c) => ({ ...c, name: normalizeSpace(c.name), issuer: normalizeSpace(c.issuer) }));
  const achievements = uniqueCaseInsensitive(splitLines(profile.achievements).map(cleanBullet));
  const additional: ResumeSection[] = ADDITIONAL_KINDS.map((kind) => ({
    id: kind,
    title: kind,
    items: uniqueCaseInsensitive(splitLines(profile.additional[kind]).map(cleanBullet)),
  })).filter((s) => s.items.length);

  /* Section order */
  const hasExperience = sortedExp.length > 0;
  const sectionOrder: SectionKey[] = hasExperience
    ? ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "additional"]
    : ["summary", "education", "skills", "projects", "certifications", "achievements", "additional"];

  const title = normalizeSpace(profile.contact.title) || sortedExp[0]?.title || "";
  const resume: Resume = {
    contact: {
      ...profile.contact,
      fullName: normalizeSpace(profile.contact.fullName),
      title,
      email: profile.contact.email.trim(),
      phone: normalizeSpace(profile.contact.phone),
      location: normalizeSpace(profile.contact.location),
      otherLinks: profile.contact.otherLinks.map((l) => l.trim()).filter(Boolean),
    },
    summary,
    skills: groups.filter((g) => g.items.length),
    experience: sortedExp,
    projects: sortedProjects,
    education,
    certifications,
    achievements,
    additional,
    sectionOrder,
  };

  if (opts.rewrite) {
    if (rewrittenCount) changes.push(`Rewrote ${rewrittenCount} bullet opening${rewrittenCount > 1 ? "s" : ""} into direct action verbs (no new facts added).`);
    if (reordered) changes.push("Reordered bullets so the achievements most relevant to this job appear first.");
    if (alignedLabels.size) changes.push(`Matched the job's terminology for skills you already have: ${[...alignedLabels].slice(0, 6).join(", ")}.`);
    if (!profile.contact.title.trim() && title) changes.push(`Used your most recent job title ("${title}") as your headline.`);
  }
  return { resume, changes };
}

/* ---------------------- Helpers shared with the AI path --------------------- */

/** The user's source bullets for a role, in their original order (what the AI rewrites). */
export function experienceSourceBullets(e: ProfileInput["experience"][number]): string[] {
  return uniqueCaseInsensitive([...splitLines(e.responsibilities), ...splitLines(e.achievements), ...splitLines(e.results)]);
}

export function projectSourceBullets(p: ProfileInput["projects"][number]): string[] {
  return uniqueCaseInsensitive([...(p.description ? [p.description] : []), ...splitLines(p.responsibilities), ...splitLines(p.outcomes)]);
}

/** Local rewrite of a single bullet (used when an AI bullet is rejected). */
export function polishBullet(text: string, jd: JdAnalysis): string {
  return applyAlignments(cleanBullet(strengthenOpening(text, "past").text), buildAlignments(jd));
}

export function alignText(text: string, jd: JdAnalysis): string {
  return applyAlignments(text, buildAlignments(jd));
}
