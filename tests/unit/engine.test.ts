import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { analyzeJd } from "../../shared/jd-analyzer";
import { parseResumeText } from "../../shared/resume-parser";
import { buildResume } from "../../shared/optimizer";
import { scoreResume, titleSimilarity } from "../../shared/scoring";
import { strengthenOpening, startsWithStrongVerb } from "../../shared/verbs";
import { buildGuardContext, checkText } from "../../shared/guard";
import { validateJd, isValidUrl, validateProfileForGeneration } from "../../shared/validation";
import { parseLooseDate, formatRange, totalYears } from "../../shared/dates";
import { extractNumbers, hasMetric, emptyProfile } from "../../shared/util";
import { profileCorpus, resumeToText } from "../../shared/resume-text";
import { findTerms } from "../../shared/skills-dictionary";

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, "../fixtures", f), "utf8");

test("JD analyzer extracts title, years, education, required vs preferred skills", () => {
  const jd = analyzeJd(fx("jd-backend.txt"));
  assert.equal(jd.title, "Senior Backend Engineer");
  assert.equal(jd.minYears, 5);
  assert.equal(jd.educationRequirement, "Bachelor's degree");
  for (const s of ["Python", "PostgreSQL", "Kubernetes", "Docker"]) assert.ok(jd.requiredSkills.includes(s), `required ${s}`);
  for (const s of ["Terraform", "Rust"]) assert.ok(jd.preferredSkills.includes(s), `preferred ${s}`);
  assert.ok(jd.keywords.some((k) => k.term === "PCI DSS"), "multi-word acronym kept together");
});

test("JD analyzer ignores department mentions and benefits boilerplate", () => {
  const jd = analyzeJd(fx("jd-data-analyst.txt"));
  assert.ok(!jd.keywords.some((k) => k.canonical === "data engineering"), "'partner with data engineering' is not a skill requirement");
  assert.equal(jd.title, "Data Analyst");
  assert.equal(jd.minYears, 3);
});

test("skill matching respects word boundaries and case-sensitive collisions", () => {
  const keys = (t: string) => findTerms(t).map((h) => h.entry.key);
  assert.ok(!keys("We go live next week and excel at service").includes("go"));
  assert.ok(!keys("We go live next week and excel at service").includes("excel"));
  assert.ok(keys("Built services in Go and Java").includes("go"));
  assert.ok(!keys("JavaScript developer").includes("java"));
  assert.ok(keys("Experience with React Native").includes("react native"));
  assert.ok(!keys("Experience with React Native").includes("react"));
});

test("resume parser extracts contact, roles, dates, education and skills", () => {
  const { profile } = parseResumeText(fx("resume-priya.txt"));
  assert.equal(profile.contact.fullName, "Priya Sharma");
  assert.equal(profile.contact.email, "priya.sharma@example.com");
  assert.equal(profile.contact.phone, "+91 98450 12345");
  assert.equal(profile.experience.length, 2);
  const [a, b] = profile.experience;
  assert.deepEqual([a.title, a.company, a.startDate, a.current], ["Software Engineer II", "Finlytics Technologies Pvt Ltd", "2021-01", true]);
  assert.deepEqual([b.title, b.company, b.location, b.startDate, b.endDate], ["Software Engineer", "Quickcart Solutions", "Pune", "2018-07", "2020-12"]);
  assert.equal(b.technologies, "Python, Flask, Redis, AWS EC2, Jenkins");
  assert.equal(profile.education[0].institution, "Vellore Institute of Technology");
  assert.equal(profile.education[0].grade, "CGPA: 8.6/10");
  assert.equal(profile.skills.languages, "Python, Java, SQL");
  assert.equal(profile.skills.platforms, "AWS (EC2, S3, Lambda)");
  assert.equal(profile.certifications[0].issuer, "Amazon Web Services");
});

test("bullet rewriting strengthens openings without adding content", () => {
  const cases: [string, string][] = [
    ["Responsible for managing projects.", "Managed projects"],
    ["responsible for the development of internal tools", "Developed internal tools"],
    ["Worked on migrating the ledger to PostgreSQL", "Migrated the ledger to PostgreSQL"],
    ["Helped improve onboarding flow", "Contributed to improving onboarding flow"],
    ["Helped clean and model data", "Helped clean and model data"],
    ["Testing framework for APIs", "Testing framework for APIs"],
    ["I developed REST APIs", "Developed REST APIs"],
  ];
  for (const [inp, out] of cases) assert.equal(strengthenOpening(inp, "past").text, out, inp);
  assert.ok(startsWithStrongVerb("Built dashboards"));
  assert.ok(!startsWithStrongVerb("Responsible for dashboards"));
});

test("optimizer never introduces numbers or skills that aren't in the user's material", () => {
  const { profile } = parseResumeText(fx("resume-priya.txt"));
  for (const jdFile of ["jd-backend.txt", "jd-marketing.txt", "jd-data-analyst.txt"]) {
    const jd = analyzeJd(fx(jdFile));
    const { resume } = buildResume(profile, jd, { rewrite: true });
    const corpus = profileCorpus(profile);
    const ctx = buildGuardContext(corpus);
    const out = resumeToText(resume);
    for (const n of extractNumbers(out)) assert.ok(ctx.corpusNumbers.has(n.replace(/[$₹€£+,]/g, "")) || /^20\d\d$|^19\d\d$/.test(n) || /^\d\+?$/.test(n), `${jdFile}: number ${n} traceable`);
    for (const h of findTerms(out)) assert.ok(ctx.corpusTermKeys.has(h.entry.key), `${jdFile}: skill ${h.entry.canonical} is evidenced`);
    // Structural facts are copied verbatim
    assert.deepEqual(resume.experience.map((e) => e.company).sort(), profile.experience.map((e) => e.company).sort());
  }
});

test("score is deterministic, bounded, and improves after optimization", () => {
  const { profile } = parseResumeText(fx("resume-priya.txt"));
  const jd = analyzeJd(fx("jd-backend.txt"));
  const base = scoreResume(buildResume(profile, jd, { rewrite: false }).resume, jd);
  const opt1 = scoreResume(buildResume(profile, jd, { rewrite: true }).resume, jd);
  const opt2 = scoreResume(buildResume(profile, jd, { rewrite: true }).resume, jd);
  assert.equal(opt1.total, opt2.total);
  assert.ok(opt1.total >= base.total);
  assert.ok(opt1.total >= 0 && opt1.total <= 100);
  const sum = opt1.components.reduce((s, c) => s + c.max, 0);
  assert.equal(sum, 100);
  assert.ok(opt1.keywordMatches.some((m) => !m.found && m.term === "Kubernetes"), "missing skills are reported, not added");
});

test("empty resume scores low and reports missing sections", () => {
  const jd = analyzeJd(fx("jd-backend.txt"));
  const p = emptyProfile();
  p.contact.fullName = "A B";
  const r = scoreResume(buildResume(p, jd, { rewrite: true }).resume, jd);
  assert.ok(r.total < 30, `score ${r.total}`);
  assert.ok(r.weakAreas.some((w) => w.area === "Sections"));
});

test("fabrication guard", () => {
  const ctx = buildGuardContext("Built Kafka pipelines processing 2M+ events per day at Finlytics. Python, Django.");
  assert.ok(checkText("Built Kafka pipelines handling 2M+ daily events", ctx, "Built Kafka pipelines processing 2M+ events per day").ok);
  assert.ok(!checkText("Built Kafka pipelines, boosting revenue 300%", ctx).ok, "new metric rejected");
  assert.ok(!checkText("Built Kafka pipelines on Kubernetes", ctx).ok, "new tool rejected");
  assert.ok(!checkText("Built pipelines for Google partners", ctx).ok, "new proper noun rejected");
});

test("dates and validation", () => {
  assert.equal(parseLooseDate("March 2021"), "2021-03");
  assert.equal(parseLooseDate("03/2021"), "2021-03");
  assert.equal(parseLooseDate("Sept '19"), "2019-09");
  assert.equal(formatRange("2021-03", "", true), "Mar 2021 – Present");
  assert.equal(totalYears([{ startDate: "2020-01", endDate: "2020-12", current: false }, { startDate: "2020-06", endDate: "2021-12", current: false }]), 2);
  assert.ok(validateJd(""));
  assert.ok(validateJd("too short"));
  assert.equal(validateJd(fx("jd-backend.txt")), null);
  assert.ok(validateJd("x".repeat(30001)));
  assert.ok(isValidUrl("linkedin.com/in/x"));
  assert.ok(!isValidUrl("not a url"));
  assert.ok(validateProfileForGeneration(emptyProfile()).message);
  assert.ok(!hasMetric("Built B2B SaaS integrations on EC2"));
  assert.ok(hasMetric("Cut costs by 22%"));
  assert.ok(titleSimilarity("Backend Software Engineer", "Senior Backend Engineer") === 1);
});
