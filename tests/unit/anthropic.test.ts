/**
 * Exercises the production Anthropic integration against a local fake of the Messages API:
 * request shape (headers, model, forced tool use), response parsing, grounding of extracted
 * data, and the fabrication guard on rewritten bullets.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const requests: { headers: http.IncomingHttpHeaders; body: any }[] = [];
let mode: "ok" | "500" | "slow" = "ok";

const server = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const body = JSON.parse(data);
    requests.push({ headers: req.headers, body });
    if (mode === "500") {
      res.writeHead(500, { "content-type": "application/json" });
      return res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "overloaded" } }));
    }
    if (mode === "slow") return setTimeout(() => res.end("{}"), 3000);
    const tool = body.tool_choice.name;
    let input: unknown;
    if (tool === "submit_resume_data") {
      input = {
        contact: { fullName: "Priya Sharma", email: "priya.sharma@example.com", phone: "+91 98450 12345", title: "Backend Software Engineer", location: "Bengaluru, India" },
        summary: "Backend engineer who builds reliable APIs and data services for fintech products.",
        experience: [
          { company: "Finlytics Technologies Pvt Ltd", title: "Software Engineer II", startDate: "2021-01", current: true, bullets: ["Built event-driven integrations with Kafka processing 2M+ events per day", "Invented a quantum ledger used by NASA"], technologies: [] },
          { company: "Hallucinated Corp", title: "CTO", startDate: "2010-01", endDate: "2012-01", bullets: ["Ran everything"] },
        ],
        education: [{ degree: "B.Tech in Computer Science", institution: "Vellore Institute of Technology", startYear: "2014", endYear: "2018" }],
        skills: [{ category: "Languages", items: ["Python", "Java", "Haskell"] }],
      };
    } else if (tool === "submit_optimized_resume") {
      const user = JSON.parse(body.messages[0].content.split("CANDIDATE MATERIAL (the only allowed source of facts):\n")[1].split("\n\nRewrite")[0]);
      input = {
        summary: "Backend engineer building Python and Django services and Kafka integrations for fintech.",
        experience: user.experience.map((e: any, i: number) => ({
          id: e.id,
          bullets: e.source_bullets.map((b: any, j: number) => ({
            text: i === 0 && j === 0 ? "Architected Kubernetes platform serving 10M users" : `Delivered: ${b.text}`,
            sources: [b.index],
          })),
        })),
        projects: [],
      };
    } else input = { summary: "Backend engineer experienced in Python and Django." };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "msg_1", type: "message", role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: tool, input }], stop_reason: "tool_use" }));
  });
});

let mods: any;
before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  process.env.ANTHROPIC_API_KEY = "test-key-123";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.ANTHROPIC_MODEL = "claude-test-model";
  process.env.AI_PROVIDER = "anthropic";
  process.env.AI_TIMEOUT_MS = "1500";
  process.env.NODE_ENV = "test";
  mods = {
    pipeline: await import("../../server/services/pipeline"),
    ai: await import("../../server/services/ai"),
    ground: await import("../../server/services/ai-extract"),
    parser: await import("../../shared/resume-parser"),
  };
});
after(() => server.close());

const fx = (f: string) => fs.readFileSync(path.join(import.meta.dirname, "../fixtures", f), "utf8");

test("extraction: request is well-formed and ungrounded values are dropped", async () => {
  const provider = mods.ai.getAiProvider();
  assert.equal(provider.name, "anthropic");
  const text = fx("resume-priya.txt");
  const raw = await provider.extractResume(text);
  const req = requests.at(-1)!;
  assert.equal(req.headers["x-api-key"], "test-key-123");
  assert.equal(req.headers["anthropic-version"], "2023-06-01");
  assert.equal(req.body.model, "claude-test-model");
  assert.deepEqual(req.body.tool_choice, { type: "tool", name: "submit_resume_data" });
  const g = mods.ground.groundAiProfile(raw, text);
  assert.ok(g);
  const p = g.profile;
  assert.equal(p.contact.fullName, "Priya Sharma");
  assert.ok(!p.experience.some((e: any) => e.company === "Hallucinated Corp"), "invented company dropped");
  assert.ok(!p.experience[0].responsibilities.includes("NASA"), "invented bullet dropped");
  assert.ok(p.experience[0].responsibilities.includes("Kafka"));
  assert.ok(!p.skills.other[0].items.includes("Haskell"), "invented skill dropped");
  assert.ok(g.dropped >= 3);
});

test("optimization: AI rewrites are guarded, originals preserved on rejection", async () => {
  const { profile } = mods.parser.parseResumeText(fx("resume-priya.txt"));
  const stages: number[] = [];
  const result = await mods.pipeline.generate(profile, fx("jd-backend.txt"), (i: number, s: string) => s === "done" && stages.push(i));
  assert.deepEqual(stages, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.engine, "ai");
  const text = JSON.stringify(result.resume);
  assert.ok(!text.includes("10M users"), "fabricated metric rejected");
  assert.ok(!/Kubernetes/.test(result.resume.experience.flatMap((e: any) => e.bullets).join(" ")), "unevidenced tool rejected");
  assert.ok(result.guardNotes.length >= 1);
  assert.ok(result.resume.experience[0].bullets.some((b: string) => b.startsWith("Delivered:")), "accepted AI bullets used");
  assert.ok(result.resume.experience[0].bullets.some((b: string) => /reconciliation microservices/.test(b)), "rejected bullet replaced by the user's own content");
  assert.match(result.resume.summary, /Kafka integrations for fintech/);
});

test("API failure and timeout fall back to the local engine", async () => {
  const { profile } = mods.parser.parseResumeText(fx("resume-priya.txt"));
  for (const m of ["500", "slow"] as const) {
    mode = m;
    const r = await mods.pipeline.generate(profile, fx("jd-backend.txt"), () => {});
    assert.equal(r.engine, "local", m);
    assert.match(r.engineNotice, /built-in rules engine/);
    assert.ok(r.resume.experience.length === 2);
  }
  mode = "ok";
});
