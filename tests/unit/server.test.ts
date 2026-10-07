import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { extractText } from "../../server/services/extract";
import { renderResumePdf } from "../../server/services/pdf";
import { renderResumeDocx } from "../../server/services/docx";
import { parseResumeText } from "../../shared/resume-parser";
import { analyzeJd } from "../../shared/jd-analyzer";
import { buildResume } from "../../shared/optimizer";
import { resumeFilename, sanitizeResume } from "../../server/resume-input";

const fxPath = (f: string) => path.join(import.meta.dirname, "../fixtures", f);
const buf = (f: string) => fs.readFileSync(fxPath(f));

test("extracts text from PDF, DOCX and TXT", async () => {
  assert.match((await extractText(buf("resume-rahul.pdf"), "r.pdf")).text, /ShopNow Retail/);
  assert.match((await extractText(buf("resume-meera.docx"), "m.docx")).text, /• Managed Google Ads/);
  assert.match((await extractText(buf("resume-priya.txt"), "p.txt")).text, /Finlytics/);
});

test("rejects unsupported, corrupt, scanned and empty files with user-friendly messages", async () => {
  const cases: [string, RegExp][] = [
    ["photo.png", /isn't supported/],
    ["corrupt.pdf", /damaged/],
    ["fake.pdf", /damaged/],
    ["resume-scanned.pdf", /scanned image/],
    ["legacy.doc", /\.doc files/],
    ["empty.txt", /empty/],
  ];
  for (const [f, re] of cases) await assert.rejects(extractText(buf(f), f), (e: Error) => re.test(e.message), f);
});

test("two-column PDF is read column by column", async () => {
  const { text } = await extractText(buf("resume-twocol.pdf"), "t.pdf");
  const { profile } = parseResumeText(text);
  assert.equal(profile.experience.length, 2);
  assert.equal(profile.experience[0].company, "PayLite");
  assert.match(profile.skills.technical, /Figma/);
});

test("PDF renderer produces selectable text, standard headings and correct metadata", async () => {
  const { profile } = parseResumeText(fs.readFileSync(fxPath("resume-priya.txt"), "utf8"));
  const { resume } = buildResume(profile, analyzeJd(fs.readFileSync(fxPath("jd-backend.txt"), "utf8")), { rewrite: true });
  const { bytes, pageCount } = await renderResumePdf(resume, "A4");
  assert.equal(pageCount, 1);
  const { text } = await extractText(Buffer.from(bytes), "out.pdf");
  for (const s of ["Priya Sharma", "SUMMARY", "SKILLS", "EXPERIENCE", "EDUCATION", "Finlytics Technologies Pvt Ltd", "Jan 2021 – Present"]) assert.ok(text.includes(s), s);
  const letter = await renderResumePdf(resume, "Letter");
  assert.ok(letter.bytes.length > 1000);
});

test("PDF renderer handles non-Latin characters and very long tokens without crashing", async () => {
  const { resume } = buildResume(
    { ...parseResumeText(fs.readFileSync(fxPath("resume-priya.txt"), "utf8")).profile, summary: "Engineer — ₹50 lakh budget → delivered ✓ 日本語 " + "x".repeat(300), autoSummary: false },
    analyzeJd(fs.readFileSync(fxPath("jd-backend.txt"), "utf8")),
  );
  const { bytes } = await renderResumePdf(resume);
  const { text } = await extractText(Buffer.from(bytes), "o.pdf");
  assert.match(text, /INR 50 lakh budget -> delivered/);
});

test("DOCX export and filenames", async () => {
  const { resume } = buildResume(parseResumeText(fs.readFileSync(fxPath("resume-priya.txt"), "utf8")).profile, analyzeJd(fs.readFileSync(fxPath("jd-backend.txt"), "utf8")));
  const out = await renderResumeDocx(resume);
  assert.equal(out.subarray(0, 2).toString(), "PK");
  const { text } = await extractText(out, "x.docx");
  assert.match(text, /Finlytics Technologies/);
  assert.equal(resumeFilename("Priya Sharma", "pdf"), "Priya_Sharma_Resume.pdf");
  assert.equal(resumeFilename("José María de la Cruz", "pdf"), "Jose_Cruz_Resume.pdf");
  assert.equal(resumeFilename("Madonna", "docx"), "Madonna_Resume.docx");
  assert.equal(resumeFilename("", "pdf"), "My_Resume.pdf");
});

test("sanitizeResume bounds untrusted input", () => {
  const r = sanitizeResume({ contact: { fullName: "x".repeat(1000) }, experience: Array(100).fill({ bullets: Array(100).fill("b") }), sectionOrder: ["evil"] });
  assert.equal(r.contact.fullName.length, 100);
  assert.equal(r.experience.length, 20);
  assert.equal(r.experience[0].bullets.length, 15);
  assert.ok(r.sectionOrder.includes("experience"));
});
