/**
 * End-to-end tests: drives the real app in Chromium through both user journeys and the
 * failure paths, then verifies the downloaded PDFs (text extraction, page bounds, blank pages).
 *
 * Usage: npm run build && npm run test:e2e
 * Requires: playwright (with Chromium). Uses pdfjs-dist for PDF checks.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const fx = (f) => path.join(root, "tests/fixtures", f);
const artifacts = path.join(root, "tests/e2e/artifacts");
fs.mkdirSync(artifacts, { recursive: true });

const results = [];
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.stack?.split("\n").slice(0, 4).join("\n      ")}`);
  }
}

async function startServer(port, env = {}) {
  const proc = spawn(process.execPath, [path.join(root, "dist/server.mjs")], {
    cwd: root,
    env: { ...process.env, PORT: String(port), RATE_LIMIT_PER_MINUTE: "1000", AI_RATE_LIMIT_PER_MINUTE: "1000", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://localhost:${port}/api/health`);
      if (r.ok) return { proc, url: `http://localhost:${port}`, log: () => log };
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start\n" + log);
}

/* ------------------------------ PDF checks ------------------------------ */
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function inspectPdf(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  assert.equal(Buffer.from(data.slice(0, 5)).toString(), "%PDF-", "file is a PDF");
  const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter((i) => i.str.trim());
    let outOfBounds = 0;
    for (const it of items) {
      const x = it.transform[4], y = it.transform[5];
      if (x < 20 || y < 20 || x + it.width > vp.width - 20 || y > vp.height - 20) outOfBounds++;
    }
    pages.push({ text: items.map((i) => i.str).join(" "), count: items.length, outOfBounds });
  }
  await doc.destroy();
  const text = pages.map((p) => p.text).join("\n");
  return { numPages: pages.length, pages, text };
}
function assertCleanPdf(info, mustContain) {
  assert.ok(info.numPages >= 1, "has pages");
  info.pages.forEach((p, i) => {
    assert.ok(p.count > 3, `page ${i + 1} is not blank`);
    assert.equal(p.outOfBounds, 0, `page ${i + 1}: no text outside margins (clipping)`);
  });
  for (const s of mustContain) assert.ok(info.text.includes(s), `PDF text contains "${s}"`);
  for (const h of ["EXPERIENCE", "EDUCATION", "SKILLS"]) {
    if (mustContain.includes("__nosections__")) break;
  }
}

/* ------------------------------- Helpers ------------------------------- */
const JD_DATA = fs.readFileSync(fx("jd-data-analyst.txt"), "utf8");
const JD_MKT = fs.readFileSync(fx("jd-marketing.txt"), "utf8");
const JD_BACKEND = fs.readFileSync(fx("jd-backend.txt"), "utf8");

async function enterJd(page, base, jd) {
  await page.goto(base + "/build");
  await page.getByRole("heading", { name: "What job are you targeting?" }).waitFor();
  await page.getByLabel("Paste Your Target Job Description").fill(jd);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("heading", { name: "How would you like to start?" }).waitFor();
}

async function uploadAndBuild(page, file) {
  await page.getByRole("button", { name: /Upload Your Existing Resume/ }).click();
  await page.getByRole("heading", { name: "Upload your resume" }).waitFor();
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByRole("heading", { name: "Here's what we found in your resume" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Build my tailored resume" }).click();
  await page.getByRole("heading", { name: "Your tailored resume" }).waitFor({ timeout: 60000 });
}

async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name }).click()]);
  const file = path.join(artifacts, dl.suggestedFilename());
  await dl.saveAs(file);
  return { file, filename: dl.suggestedFilename() };
}

async function scoreValue(page) {
  const t = await page.locator(".score-panel .ring-num").innerText();
  return Number(t);
}

/* -------------------------------- Tests -------------------------------- */
const main = await startServer(3201, { AI_PROVIDER: "local" });
const browser = await chromium.launch();
const consoleErrors = [];
async function newPage(viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  return page;
}

console.log("\nJourney 1: upload an existing resume");
await test("landing page renders and CTA opens the builder", async () => {
  const page = await newPage();
  await page.goto(main.url);
  await page.getByRole("heading", { name: "Build a Resume That Gets Noticed." }).waitFor();
  await page.getByRole("button", { name: "Start Your Resume Making Journey →" }).first().click();
  await page.getByRole("heading", { name: "What job are you targeting?" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/build");
  await page.context().close();
});

await test("JD validation: empty and too short are blocked with helpful errors", async () => {
  const page = await newPage();
  await page.goto(main.url + "/build");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText("Paste the job description you're targeting").waitFor();
  await page.getByLabel("Paste Your Target Job Description").fill("Looking for a developer");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText(/too short to be a full job description/).waitFor();
  assert.ok(await page.getByRole("heading", { name: "What job are you targeting?" }).isVisible());
  await page.getByLabel("Paste Your Target Job Description").fill(JD_DATA);
  await page.getByText(/words, [\d,]+ \/ 30,000 characters/).waitFor();
  await page.context().close();
});

await test("very long JD: 29k characters accepted, 31k rejected", async () => {
  const page = await newPage();
  await page.goto(main.url + "/build");
  const ta = page.getByLabel("Paste Your Target Job Description");
  const big = (JD_DATA + "\n").repeat(40).slice(0, 31000);
  await ta.fill(big);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText(/max 30,000 characters/).waitFor();
  await ta.fill(big.slice(0, 29000));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("heading", { name: "How would you like to start?" }).waitFor();
  await page.context().close();
});

let uploadPdf;
await test("upload flow: invalid files rejected, PDF parsed, resume generated, edited, rescored, downloaded", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_DATA);
  await page.screenshot({ path: path.join(artifacts, "02-method.png") });
  await page.getByRole("button", { name: /Upload Your Existing Resume/ }).click();
  const input = page.locator('input[type="file"]');
  for (const [f, msg] of [["photo.png", "isn't supported"], ["resume-scanned.pdf", "scanned image"], ["corrupt.pdf", "damaged"], ["legacy.doc", ".doc files aren't supported"], ["empty.txt", "empty"]]) {
    await input.setInputFiles(fx(f));
    await page.getByText(new RegExp(msg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).first().waitFor({ timeout: 15000 });
  }
  await input.setInputFiles(fx("resume-rahul.pdf"));
  await page.getByRole("heading", { name: "Here's what we found in your resume" }).waitFor({ timeout: 30000 });
  await page.getByText("2 roles").waitFor();
  await page.getByText("Starting optimization score for this job").waitFor();
  const baseline = Number(await page.locator(".baseline-panel .ring-num").innerText());
  await page.screenshot({ path: path.join(artifacts, "03-review-upload.png"), fullPage: true });

  await page.getByRole("button", { name: "Build my tailored resume" }).click();
  await page.getByRole("heading", { name: "Your tailored resume" }).waitFor({ timeout: 60000 });
  const score = await scoreValue(page);
  assert.ok(score >= baseline, `optimized score ${score} >= baseline ${baseline}`);
  await page.getByText(/Up \d+ points from your original|Same as your original/).waitFor();
  await page.locator(".chip-match").first().waitFor();
  await page.getByRole("heading", { name: /Missing or weak areas/ }).waitFor();
  await page.locator("canvas.pdf-page").first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(artifacts, "04-result.png"), fullPage: true });

  // Edit: change the summary, add a bullet with a metric, then recalculate
  await page.getByRole("tab", { name: /Edit resume/ }).click();
  const summary = page.getByLabel("Professional summary");
  await summary.fill("Data analyst who turns retail and e-commerce data into decisions using SQL, Python and Tableau dashboards.");
  const bullets = page.getByLabel("Bullet points").first();
  await bullets.fill((await bullets.inputValue()) + "\nReduced dashboard refresh time by 40% by rewriting SQL queries");
  await page.getByText("You've edited your resume. Recalculate to update the score.").waitFor();
  await page.getByRole("button", { name: "Recalculate ATS Score" }).first().click();
  await page.getByText(/Score updated: \d+\/100/).waitFor();
  assert.equal(await page.getByText("You've edited your resume.").count(), 0, "stale flag cleared");

  await page.getByRole("tab", { name: /Preview/ }).click();
  await page.locator("canvas.pdf-page").first().waitFor();

  const { file, filename } = await download(page, /Download Resume PDF/);
  assert.equal(filename, "Rahul_Verma_Resume.pdf");
  const info = await inspectPdf(file);
  assertCleanPdf(info, ["Rahul Verma", "rahul.verma@example.com", "EXPERIENCE", "EDUCATION", "SKILLS", "turns retail and e-commerce data into decisions", "Reduced dashboard refresh time by 40%", "ShopNow Retail Pvt Ltd"]);
  uploadPdf = info;
  const docx = await download(page, /Word/);
  assert.equal(docx.filename, "Rahul_Verma_Resume.docx");
  assert.ok(fs.statSync(docx.file).size > 3000, "docx has content");
  await page.context().close();
});

await test("refresh keeps the session (sessionStorage), Start over clears it", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_DATA);
  await page.reload();
  await page.getByRole("heading", { name: "How would you like to start?" }).waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Start over/ }).click();
  await page.getByRole("heading", { name: "What job are you targeting?" }).waitFor();
  assert.equal(await page.getByLabel("Paste Your Target Job Description").inputValue(), "");
  await page.context().close();
});

console.log("\nJourney 2: create from details");
let formPdf;
await test("form flow: validation, all sections, summary draft, generate, edit, download", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_MKT);
  await page.getByRole("button", { name: /Create Resume From Details/ }).click();
  await page.getByRole("heading", { name: "Your contact details" }).waitFor();

  // Personal
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText("Enter your full name.").waitFor();
  await page.getByLabel("Full name").fill("Aisha Kapoor");
  await page.getByLabel("Email").fill("aisha.kapoor@");
  await page.getByLabel("LinkedIn URL").fill("not a url");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText("Enter a valid email").waitFor();
  await page.getByText("Enter a valid URL").waitFor();
  await page.getByLabel("Email").fill("aisha.kapoor@example.com");
  await page.getByLabel("LinkedIn URL").fill("linkedin.com/in/aishakapoor");
  await page.getByLabel("Professional title / desired role").fill("Digital Marketing Manager");
  await page.getByLabel("Phone number").fill("+91 98200 12345");
  await page.getByLabel("City / location").fill("Mumbai, India");
  await page.getByRole("button", { name: "Next →" }).click();

  // Summary (keep automatic)
  await page.getByRole("heading", { name: "Professional summary" }).waitFor();
  await page.getByText("Generate my professional summary automatically").waitFor();
  await page.getByRole("button", { name: "Next →" }).click();

  // Experience
  await page.getByRole("heading", { name: "Work experience" }).waitFor();
  await page.getByLabel("Job title").first().fill("Marketing Manager");
  await page.getByLabel("Company").first().fill("Growthly Media");
  await page.getByLabel("Location").first().fill("Mumbai");
  await page.getByLabel("Start date year").first().selectOption("2021");
  await page.getByLabel("Start date month").first().selectOption("04");
  await page.getByLabel("I currently work here").first().check();
  await page.getByLabel("Responsibilities").first().fill("Responsible for managing Google Ads and Meta Ads campaigns for B2B SaaS clients\nWorked on SEO content strategy for the company blog\nHandled weekly reporting in Google Analytics");
  await page.getByLabel("Quantifiable results").first().fill("Grew organic traffic by 65% in 12 months\nCut customer acquisition cost by 22%");
  await page.getByLabel("Technologies / tools used").first().fill("Google Ads, Meta Ads, HubSpot, Google Analytics, Excel");
  await page.getByRole("button", { name: "Add Another Experience" }).click();
  await page.getByLabel("Job title").nth(1).fill("Marketing Associate");
  await page.getByLabel("Company").nth(1).fill("AdBridge");
  await page.getByLabel("Start date year").nth(1).selectOption("2018");
  await page.getByLabel("Start date month").nth(1).selectOption("07");
  await page.getByLabel("End date year").nth(1).selectOption("2017");
  await page.getByLabel("Responsibilities").nth(1).fill("Assisted with email marketing campaigns in Mailchimp\nCreated social media content calendars");
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByText("End date is before the start date.").waitFor();
  await page.getByLabel("End date year").nth(1).selectOption("2021");
  await page.getByLabel("End date month").nth(1).selectOption("03");
  await page.screenshot({ path: path.join(artifacts, "05-form-experience.png"), fullPage: true });
  await page.getByRole("button", { name: "Next →" }).click();

  // Education
  await page.getByRole("heading", { name: "Education" }).waitFor();
  await page.getByLabel("Degree / qualification").fill("MBA in Marketing");
  await page.getByLabel("Institution").fill("NMIMS Mumbai");
  await page.getByLabel("Start year").fill("2016");
  await page.getByLabel("End year (or expected)").fill("2018");
  await page.getByLabel("CGPA / percentage").fill("CGPA 3.4/4");
  await page.getByRole("button", { name: "Next →" }).click();

  // Skills: suggestion chips exist; add one the candidate genuinely has
  await page.getByRole("heading", { name: "Skills", exact: true }).waitFor();
  await page.getByText("Skills this job asks for that aren't in your details yet").waitFor();
  await page.getByRole("button", { name: /A\/B testing/i }).click();
  await page.getByLabel("Tools").fill("Canva, Semrush");
  await page.getByLabel("Soft skills").fill("Stakeholder management");
  await page.getByRole("button", { name: "Next →" }).click();

  // Projects
  await page.getByRole("button", { name: "Add a project" }).click();
  await page.getByLabel("Project name").fill("Launch playbook");
  await page.getByLabel("What you did").fill("Built a go-to-market launch checklist used by 4 product teams");
  await page.getByRole("button", { name: "Next →" }).click();

  // Certifications & achievements
  await page.getByRole("button", { name: "Add a certification" }).click();
  await page.getByLabel("Certification name").fill("Google Ads Search Certification");
  await page.getByLabel("Issuing organization").fill("Google");
  await page.getByRole("textbox", { name: /^Achievements/ }).fill("Best Campaign Award, Growthly Media 2023");
  await page.getByRole("button", { name: "Next →" }).click();

  // Additional
  await page.getByLabel("Languages").fill("English (Fluent)\nHindi (Native)");
  // Go back to Summary and draft one now
  await page.getByRole("button", { name: "Summary" }).click();
  await page.getByRole("button", { name: /Draft a summary now/ }).click();
  await page.getByText("Here's a draft based on your details").waitFor();
  const drafted = await page.getByLabel("Your summary").inputValue();
  assert.ok(drafted.length > 40, "summary drafted");
  assert.ok(!/\d+%/.test(drafted) || /65%|22%/.test(drafted), "draft only uses user metrics");
  await page.getByRole("button", { name: "Build now" }).click();

  await page.getByRole("heading", { name: "Your tailored resume" }).waitFor({ timeout: 60000 });
  const score = await scoreValue(page);
  assert.ok(score > 50, `score is ${score}`);
  await page.locator("canvas.pdf-page").first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: path.join(artifacts, "06-form-result.png"), fullPage: true });

  await page.getByRole("tab", { name: /Edit resume/ }).click();
  await page.getByLabel("Headline").fill("Digital Marketing Manager");
  await page.getByRole("button", { name: "Recalculate ATS Score" }).first().click();
  await page.getByText(/Score updated/).waitFor();

  const { file, filename } = await download(page, /Download Resume PDF/);
  assert.equal(filename, "Aisha_Kapoor_Resume.pdf");
  const info = await inspectPdf(file);
  assertCleanPdf(info, ["Aisha Kapoor", "Growthly Media", "Grew organic traffic by 65%", "MBA in Marketing", "Google Ads Search Certification", "LANGUAGES", "English (Fluent)"]);
  // Anti-fabrication: nothing numeric appears that the user didn't enter
  const nums = info.text.match(/\d+%/g) || [];
  for (const n of nums) assert.ok(["65%", "22%"].includes(n), `unexpected metric ${n}`);
  formPdf = info;
  await page.context().close();
});

console.log("\nLayouts and robustness");
await test("mobile layout: no horizontal overflow on each screen", async () => {
  const page = await newPage({ width: 375, height: 800 });
  const noOverflow = async (label) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.ok(w <= 376, `${label}: page width ${w} fits 375px viewport`);
  };
  await page.goto(main.url);
  await noOverflow("landing");
  await page.screenshot({ path: path.join(artifacts, "m1-landing.png"), fullPage: true });
  await enterJd(page, main.url, JD_DATA);
  await noOverflow("method");
  await uploadAndBuild(page, fx("resume-rahul.pdf"));
  await page.locator("canvas.pdf-page").first().waitFor({ timeout: 30000 });
  await noOverflow("result");
  await page.screenshot({ path: path.join(artifacts, "m2-result.png"), fullPage: true });
  await page.getByRole("tab", { name: /Edit resume/ }).click();
  await noOverflow("editor");
  await page.context().close();
});

await test("multi-page resume upload produces a clean multi-page PDF", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_BACKEND);
  await uploadAndBuild(page, fx("resume-long.pdf"));
  const { file } = await download(page, /Download Resume PDF/);
  const info = await inspectPdf(file);
  assert.ok(info.numPages >= 2, `expected 2+ pages, got ${info.numPages}`);
  assertCleanPdf(info, ["Vikram Nair", "Stripe", "TCS", "Stanford University"]);
  await page.context().close();
});

await test("unusual formatting: two-column PDF and DOCX parse into the right sections", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_MKT);
  await page.getByRole("button", { name: /Upload Your Existing Resume/ }).click();
  await page.locator('input[type="file"]').setInputFiles(fx("resume-twocol.pdf"));
  await page.getByRole("heading", { name: "Here's what we found in your resume" }).waitFor({ timeout: 30000 });
  await page.getByText("2 roles").waitFor();
  await page.getByRole("button", { name: /Upload a different file/ }).click();
  await page.locator('input[type="file"]').setInputFiles(fx("resume-meera.docx"));
  await page.getByRole("heading", { name: "Here's what we found in your resume" }).waitFor({ timeout: 30000 });
  await page.getByText("2 roles").waitFor();
  await page.getByRole("button", { name: "Build my tailored resume" }).click();
  await page.getByRole("heading", { name: "Your tailored resume" }).waitFor({ timeout: 60000 });
  const { file } = await download(page, /Download Resume PDF/);
  assertCleanPdf(await inspectPdf(file), ["Meera Iyer", "CloudNest Technologies", "8 lakh"]);
  await page.context().close();
});

await test("network failure during generation shows a retry, and retry succeeds", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_DATA);
  let fail = true;
  await page.route("**/api/generate", (route) => (fail ? route.abort("failed") : route.continue()));
  await page.getByRole("button", { name: /Upload Your Existing Resume/ }).click();
  await page.locator('input[type="file"]').setInputFiles(fx("resume-rahul.pdf"));
  await page.getByRole("button", { name: "Build my tailored resume" }).click();
  await page.getByText("We couldn't reach the server").waitFor();
  await page.getByRole("heading", { name: "We hit a problem" }).waitFor();
  fail = false;
  await page.getByRole("button", { name: /Try again/ }).click();
  await page.getByRole("heading", { name: "Your tailored resume" }).waitFor({ timeout: 60000 });
  await page.context().close();
});

await test("PDF generation failure is reported without raw errors", async () => {
  const page = await newPage();
  await enterJd(page, main.url, JD_DATA);
  await uploadAndBuild(page, fx("resume-rahul.pdf"));
  await page.route("**/api/export/pdf", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { message: "We couldn't create your PDF. Please try again, or download the Word version instead." } }) }),
  );
  await page.getByRole("button", { name: /Download Resume PDF/ }).click();
  await page.getByText("We couldn't create your PDF").first().waitFor();
  await page.context().close();
});

main.proc.kill();

console.log("\nAI provider paths");
await test("AI outage falls back to the local engine with a clear notice", async () => {
  const srv = await startServer(3202, { AI_PROVIDER: "fail" });
  const page = await newPage();
  await enterJd(page, srv.url, JD_DATA);
  await uploadAndBuild(page, fx("resume-rahul.pdf"));
  await page.getByText("Our AI writing service didn't respond").waitFor();
  assert.ok(!/AiUnavailable|HTTP|stack/i.test(await page.locator("main").innerText()), "no raw technical errors shown");
  await page.context().close();
  srv.proc.kill();
});

await test("fabrication guard rejects invented AI claims (mock model injects a fake metric and tool)", async () => {
  const srv = await startServer(3203, { AI_PROVIDER: "mock" });
  const page = await newPage();
  await enterJd(page, srv.url, JD_DATA);
  await uploadAndBuild(page, fx("resume-rahul.pdf"));
  await page.getByText("We kept your resume factual").waitFor();
  const { file } = await download(page, /Download Resume PDF/);
  const info = await inspectPdf(file);
  assert.ok(!info.text.includes("300%"), "fabricated metric removed");
  assert.ok(!/Snowflake/.test(info.text), "unevidenced tool removed");
  await page.context().close();
  srv.proc.kill();
});

await browser.close();

const failed = results.filter((r) => !r.ok);
if (consoleErrors.length) console.log("\nBrowser console errors:", [...new Set(consoleErrors)]);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(artifacts, "report.json"), JSON.stringify({ results, consoleErrors, uploadPages: uploadPdf?.numPages, formPages: formPdf?.numPages }, null, 2));
process.exit(failed.length ? 1 : 0);
