/**
 * Deterministic ATS optimization score. Every point is traceable to a measurable property
 * of the resume relative to the job description. No randomness.
 */
import type { Resume, JdAnalysis, AtsReport, ScoreComponent, Insight, KeywordMatch } from "./types";
import { textHasTerm } from "./skills-dictionary";
import { resumeToText } from "./resume-text";
import { phraseInText } from "./optimizer";
import { startsWithStrongVerb } from "./verbs";
import { hasMetric, wordCount } from "./util";
import { totalYears } from "./dates";

const SENIORITY_WORDS = new Set(["senior", "sr", "junior", "jr", "lead", "principal", "staff", "i", "ii", "iii", "iv", "associate", "head", "chief", "intern", "trainee", "entry", "level", "mid", "the", "of", "and", "&", "-", "–"]);
const TITLE_SYNONYMS: Record<string, string> = { developer: "engineer", programmer: "engineer", swe: "engineer", dev: "engineer", "front-end": "frontend", "back-end": "backend", "full-stack": "fullstack" };

function titleTokens(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/full[\s-]stack/g, "fullstack")
      .replace(/front[\s-]end/g, "frontend")
      .replace(/back[\s-]end/g, "backend")
      .split(/[^a-z0-9+#.]+/)
      .map((w) => TITLE_SYNONYMS[w] ?? w)
      .filter((w) => w && !SENIORITY_WORDS.has(w)),
  );
}

export function titleSimilarity(a: string, b: string): number {
  const A = titleTokens(a);
  const B = titleTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  // Weighted toward covering the JD title's core words
  return inter / B.size;
}

const WEIGHT = { required: 3, preferred: 1.5 };

export interface ScoreOptions {
  pageCount?: number;
}

export function scoreResume(resume: Resume, jd: JdAnalysis, opts: ScoreOptions = {}): AtsReport {
  const fullText = resumeToText(resume);
  const skillsText = resume.skills.map((g) => g.items.join(", ")).join("\n");
  const allBullets = [...resume.experience.flatMap((e) => e.bullets), ...resume.projects.flatMap((p) => p.bullets)];
  const experienceText = [
    ...resume.experience.flatMap((e) => [e.title, ...e.bullets, ...e.technologies]),
    ...resume.projects.flatMap((p) => [p.name, ...p.bullets, ...p.technologies]),
  ].join("\n");

  const components: ScoreComponent[] = [];
  const weakAreas: Insight[] = [];
  const suggestions: Insight[] = [];

  /* 1. Keyword coverage (30) */
  const matches: KeywordMatch[] = jd.keywords.map((k) => {
    const found = k.kind === "domain" ? phraseInText(k.term, fullText) : textHasTerm(fullText, k.canonical);
    return {
      term: k.term,
      importance: k.importance,
      kind: k.kind,
      found,
      inSkills: k.kind === "domain" ? false : textHasTerm(skillsText, k.canonical),
      inExperience: k.kind === "domain" ? phraseInText(k.term, experienceText) : textHasTerm(experienceText, k.canonical),
    };
  });
  const weightOf = (m: KeywordMatch) => WEIGHT[m.importance] * (m.kind === "soft" ? 0.4 : m.kind === "domain" ? 0.6 : 1);
  const totalW = matches.reduce((s, m) => s + weightOf(m), 0);
  const foundW = matches.filter((m) => m.found).reduce((s, m) => s + weightOf(m), 0);
  const coverage = totalW ? foundW / totalW : 1;
  const kwScore = 30 * coverage;
  const foundCount = matches.filter((m) => m.found).length;
  components.push({
    key: "keywords",
    label: "Keyword coverage",
    score: kwScore,
    max: 30,
    detail: totalW ? `${foundCount} of ${matches.length} job keywords appear in your resume (weighted ${Math.round(coverage * 100)}%).` : "No specific keywords were detected in the job description.",
  });

  /* 2. Skills alignment (15) */
  const hard = matches.filter((m) => m.kind === "skill" || m.kind === "tool");
  const hardRequired = hard.filter((m) => m.importance === "required");
  const hardFound = hard.filter((m) => m.found);
  let skillsScore = 15;
  if (hard.length) {
    const reqInSkills = hardRequired.length ? hardRequired.filter((m) => m.inSkills).length / hardRequired.length : 1;
    const foundInSkills = hardFound.length ? hardFound.filter((m) => m.inSkills).length / hardFound.length : 0;
    skillsScore = 15 * (0.6 * reqInSkills + 0.4 * foundInSkills);
  }
  components.push({
    key: "skills",
    label: "Skills alignment",
    score: skillsScore,
    max: 15,
    detail: hard.length
      ? `${hardRequired.filter((m) => m.inSkills).length} of ${hardRequired.length} required skills are listed in your Skills section.`
      : "The job description lists no specific hard skills.",
  });

  /* 3. Job title alignment (10) */
  let titleScore = 10;
  let titleDetail = "No job title detected in the job description.";
  if (jd.title) {
    const candidates = [resume.contact.title, ...resume.experience.slice(0, 2).map((e) => e.title)].filter(Boolean);
    const sims = candidates.map((c) => titleSimilarity(c, jd.title));
    const headlineSim = resume.contact.title ? titleSimilarity(resume.contact.title, jd.title) : 0;
    const best = Math.max(0, ...sims);
    titleScore = 10 * Math.min(1, 0.7 * best + 0.3 * headlineSim);
    titleDetail = best >= 0.99 ? `Your titles match "${jd.title}".` : best > 0 ? `Your titles partially match "${jd.title}".` : `None of your titles resemble "${jd.title}".`;
    if (headlineSim < 0.6) {
      weakAreas.push({
        severity: best > 0.5 ? "low" : "medium",
        area: "Job title",
        message: resume.contact.title
          ? `Your headline "${resume.contact.title}" differs from the target title "${jd.title}". If it honestly describes you, use the target title as your headline.`
          : `Add a headline. If it's accurate for you, "${jd.title}" matches the posting.`,
      });
    }
  }
  components.push({ key: "title", label: "Job title alignment", score: titleScore, max: 10, detail: titleDetail });

  /* 4. Experience relevance (15) */
  const relevantBullets = allBullets.filter((b) => jd.keywords.some((k) => (k.kind === "domain" ? phraseInText(k.term, b) : textHasTerm(b, k.canonical)))).length;
  const relRatio = allBullets.length ? relevantBullets / allBullets.length : 0;
  const relScore = 8 * Math.min(1, relRatio / 0.6);
  const years = totalYears(resume.experience);
  let yearsScore: number;
  let yearsDetail: string;
  if (jd.minYears) {
    yearsScore = 7 * Math.min(1, years / jd.minYears);
    yearsDetail = `about ${years} years of experience (${jd.minYears}+ requested)`;
    if (years + 0.25 < jd.minYears) {
      weakAreas.push({
        severity: years < jd.minYears * 0.6 ? "high" : "medium",
        area: "Experience",
        message: `The job asks for ${jd.minYears}+ years; your resume shows about ${years}. Make sure all relevant roles, internships and dates are included.`,
      });
    }
  } else {
    yearsScore = resume.experience.length ? 7 : resume.projects.length ? 4 : 2;
    yearsDetail = resume.experience.length ? `${years} years of experience listed` : "no work experience listed";
  }
  components.push({
    key: "experience",
    label: "Experience relevance",
    score: relScore + yearsScore,
    max: 15,
    detail: `${relevantBullets} of ${allBullets.length} bullets reference the job's keywords; ${yearsDetail}.`,
  });

  /* 5. Impact & language (10) */
  const strong = allBullets.filter(startsWithStrongVerb).length;
  const quantified = allBullets.filter(hasMetric).length;
  const strongRatio = allBullets.length ? strong / allBullets.length : 0;
  const quantRatio = allBullets.length ? quantified / allBullets.length : 0;
  const impactScore = allBullets.length ? 5 * Math.min(1, strongRatio / 0.8) + 5 * Math.min(1, quantRatio / 0.4) : 0;
  components.push({
    key: "impact",
    label: "Impact & action verbs",
    score: impactScore,
    max: 10,
    detail: allBullets.length ? `${strong} of ${allBullets.length} bullets start with an action verb; ${quantified} include measurable results.` : "No experience or project bullets yet.",
  });

  /* 6. Section completeness (10) */
  const skillCount = resume.skills.reduce((n, g) => n + g.items.length, 0);
  const parts = [
    { ok: !!resume.contact.fullName, pts: 1, name: "your name" },
    { ok: wordCount(resume.summary) >= 8, pts: 2, name: "a professional summary" },
    { ok: resume.experience.length > 0 || resume.projects.length > 0, pts: 3, name: "experience or projects" },
    { ok: resume.education.length > 0, pts: 2, name: "education" },
    { ok: skillCount >= 5, pts: 2, name: "a skills section (5+ skills)" },
  ];
  const compScore = parts.filter((p) => p.ok).reduce((s, p) => s + p.pts, 0);
  const missingParts = parts.filter((p) => !p.ok).map((p) => p.name);
  components.push({
    key: "completeness",
    label: "Section completeness",
    score: compScore,
    max: 10,
    detail: missingParts.length ? `Missing: ${missingParts.join(", ")}.` : "All standard sections are present.",
  });
  if (missingParts.length) weakAreas.push({ severity: "high", area: "Sections", message: `Add ${missingParts.join(", ")}. ATS systems and recruiters expect these sections.` });

  /* 7. Contact completeness (5) */
  const c = resume.contact;
  let contactScore = 0;
  const missingContact: string[] = [];
  if (c.email) contactScore += 2; else missingContact.push("email");
  if (c.phone) contactScore += 1.5; else missingContact.push("phone number");
  if (c.location) contactScore += 0.5; else missingContact.push("location");
  if (c.linkedin) contactScore += 1;
  else if (c.github || c.portfolio) {
    contactScore += 0.5;
    missingContact.push("LinkedIn URL");
  } else missingContact.push("LinkedIn URL");
  components.push({
    key: "contact",
    label: "Contact information",
    score: contactScore,
    max: 5,
    detail: missingContact.length ? `Missing: ${missingContact.join(", ")}.` : "Email, phone, location and LinkedIn are present.",
  });
  if (missingContact.length) {
    weakAreas.push({ severity: missingContact.includes("email") ? "high" : "low", area: "Contact", message: `Add your ${missingContact.join(", ")}.` });
  }

  /* 8. Formatting & readability (5) */
  let fmt = 5;
  const fmtIssues: string[] = [];
  const longBullets = allBullets.filter((b) => wordCount(b) > 40);
  if (longBullets.length) {
    fmt -= Math.min(1.5, longBullets.length * 0.25);
    fmtIssues.push(`${longBullets.length} bullet${longBullets.length > 1 ? "s are" : " is"} over 40 words`);
  }
  const shortBullets = allBullets.filter((b) => wordCount(b) < 4);
  if (shortBullets.length) {
    fmt -= Math.min(1, shortBullets.length * 0.25);
    fmtIssues.push(`${shortBullets.length} bullet${shortBullets.length > 1 ? "s are" : " is"} very short`);
  }
  if (wordCount(resume.summary) > 90) {
    fmt -= 1;
    fmtIssues.push("the summary is over 90 words");
  }
  const pronouns = [resume.summary, ...allBullets].filter((t) => /(^|\s)(I|my|me|I'm|I've)\b/.test(t)).length;
  if (pronouns) {
    fmt -= 1;
    fmtIssues.push("first-person pronouns are used");
  }
  if (resume.experience.some((e) => e.bullets.length > 8)) {
    fmt -= 0.5;
    fmtIssues.push("a role has more than 8 bullets");
  }
  if ((opts.pageCount ?? 0) > 2) {
    fmt -= 1;
    fmtIssues.push(`the resume runs to ${opts.pageCount} pages`);
  }
  fmt = Math.max(0, fmt);
  components.push({
    key: "formatting",
    label: "Formatting & readability",
    score: fmt,
    max: 5,
    detail: fmtIssues.length ? `Issues: ${fmtIssues.join("; ")}.` : "Single-column layout, standard headings, concise bullets.",
  });

  /* ---------------------------- Insights ---------------------------- */
  const missingRequired = matches.filter((m) => !m.found && m.importance === "required" && m.kind !== "soft");
  const missingPreferred = matches.filter((m) => !m.found && m.importance === "preferred" && m.kind !== "soft");
  if (missingRequired.length) {
    weakAreas.unshift({
      severity: missingRequired.length > 3 ? "high" : "medium",
      area: "Missing keywords",
      message: `The job asks for ${missingRequired.slice(0, 8).map((m) => m.term).join(", ")}${missingRequired.length > 8 ? ` and ${missingRequired.length - 8} more` : ""}, which your resume doesn't mention. Add them only where you have real experience.`,
    });
  }
  if (missingPreferred.length) {
    weakAreas.push({
      severity: "low",
      area: "Nice-to-have keywords",
      message: `Preferred but not mentioned: ${missingPreferred.slice(0, 6).map((m) => m.term).join(", ")}.`,
    });
  }
  if (jd.educationRequirement && !resume.education.length) {
    weakAreas.push({ severity: "medium", area: "Education", message: `The job mentions a ${jd.educationRequirement}. Add your education details.` });
  }

  const unquantified = resume.experience.flatMap((e) => e.bullets).filter((b) => !hasMetric(b));
  if (allBullets.length && quantRatio < 0.4) {
    suggestions.push({
      severity: "medium",
      area: "Quantify results",
      message: `Only ${quantified} of ${allBullets.length} bullets include numbers. If you know them, add figures such as time saved, volume handled, revenue or percentage improvement — for example to: "${truncate(unquantified[0] ?? allBullets[0], 90)}".`,
    });
  }
  const skillsOnly = matches.filter((m) => m.found && m.inSkills && !m.inExperience && (m.kind === "skill" || m.kind === "tool") && m.importance === "required");
  if (skillsOnly.length) {
    suggestions.push({
      severity: "low",
      area: "Show skills in context",
      message: `${skillsOnly.slice(0, 5).map((m) => m.term).join(", ")} appear${skillsOnly.length === 1 ? "s" : ""} only in your Skills list. If you used ${skillsOnly.length === 1 ? "it" : "them"} at work or in projects, mention where in a bullet.`,
    });
  }
  const weak = allBullets.filter((b) => !startsWithStrongVerb(b));
  if (weak.length && allBullets.length && strongRatio < 0.8) {
    suggestions.push({ severity: "low", area: "Action verbs", message: `${weak.length} bullet${weak.length > 1 ? "s don't" : " doesn't"} start with a clear action verb, e.g. "${truncate(weak[0], 80)}".` });
  }
  if (longBullets.length) suggestions.push({ severity: "low", area: "Concise bullets", message: `Split or trim bullets over 40 words so each one states a single result.` });
  if (fmtIssues.some((i) => i.includes("pronouns"))) suggestions.push({ severity: "low", area: "Tone", message: `Remove "I" and "my" — resumes are written in implied first person.` });
  if (jd.actionVerbs.length && allBullets.length) {
    const used = new Set(allBullets.map((b) => b.split(/\s+/)[0].toLowerCase().replace(/(ed|d)$/, "")));
    const notUsed = jd.actionVerbs.filter((v) => !used.has(v.toLowerCase().replace(/e$/, "")) && !used.has(v.toLowerCase()));
    if (notUsed.length >= 3) {
      suggestions.push({ severity: "low", area: "Mirror the job's language", message: `The posting emphasizes ${notUsed.slice(0, 4).join(", ").toLowerCase()}. Where it's true for you, describe your work with those verbs.` });
    }
  }

  const total = Math.max(0, Math.min(100, Math.round(components.reduce((s, x) => s + x.score, 0))));
  if (total >= 90 && !suggestions.length) suggestions.push({ severity: "low", area: "Ready", message: "Your resume is strongly aligned with this job. Review wording once more before you apply." });

  return {
    total,
    components: components.map((x) => ({ ...x, score: Math.round(x.score * 10) / 10 })),
    keywordMatches: matches,
    weakAreas,
    suggestions,
    stats: {
      bulletCount: allBullets.length,
      quantifiedBullets: quantified,
      strongVerbBullets: strong,
      yearsOfExperience: years,
      wordCount: wordCount(fullText),
    },
  };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
