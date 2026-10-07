import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { env } from "./env";
import { log, errorClass } from "./logger";
import { UserError, GENERIC_ERROR, securityHeaders, sendJson, sendError, readBody, readJson, clientIp, RateLimiter } from "./http";
import { extractText } from "./services/extract";
import { parseResumeText } from "../shared/resume-parser";
import { analyzeJd } from "../shared/jd-analyzer";
import { buildResume } from "../shared/optimizer";
import { scoreResume } from "../shared/scoring";
import { validateJd, LIMITS } from "../shared/validation";
import type { ProfileInput, ParseResult, StreamEvent } from "../shared/types";
import { generate, generateSummary, sanitizeProfile } from "./services/pipeline";
import { renderResumePdf } from "./services/pdf";
import { renderResumeDocx } from "./services/docx";
import { getAiProvider, aiStatus } from "./services/ai";
import { groundAiProfile } from "./services/ai-extract";
import { sanitizeResume, pageSizeOf, resumeFilename } from "./resume-input";

const general = new RateLimiter(env.rateLimitPerMinute);
const heavy = new RateLimiter(env.aiRateLimitPerMinute);

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<void>;

function requireJd(text: unknown): string {
  const t = typeof text === "string" ? text : "";
  const err = validateJd(t);
  if (err) throw new UserError(400, err, "invalid_jd");
  return t;
}

const routes: Record<string, { handler: Handler; heavy?: boolean }> = {
  "GET /api/health": {
    handler: async (_req, res) => sendJson(res, 200, { ok: true, ai: aiStatus() }),
  },

  "POST /api/jd": {
    handler: async (req, res) => {
      const body = await readJson<{ jdText?: string }>(req, 200_000);
      sendJson(res, 200, { jd: analyzeJd(requireJd(body.jdText)) });
    },
  },

  "POST /api/parse": {
    heavy: true,
    handler: async (req, res) => {
      const rawName = decodeURIComponent(String(req.headers["x-file-name"] || "resume"));
      const filename = path.basename(rawName).slice(0, 200);
      const buf = await readBody(req, LIMITS.fileMaxBytes);
      const { text } = await extractText(buf, filename);
      const heuristic = parseResumeText(text);
      let result: ParseResult = { ...heuristic, textLength: text.length, engine: "local" };
      const ai = getAiProvider();
      if (ai) {
        try {
          const grounded = groundAiProfile(await ai.extractResume(text), text);
          if (grounded) {
            result = { profile: grounded.profile, detectedSections: heuristic.detectedSections, warnings: heuristic.warnings.filter((w) => !/couldn't detect your name|standard section/i.test(w)), textLength: text.length, engine: "ai" };
          }
        } catch (e) {
          log.warn("ai_extract_failed", { error: errorClass(e) });
        }
      }
      sendJson(res, 200, result);
    },
  },

  "POST /api/analyze": {
    handler: async (req, res) => {
      const body = await readJson<{ profile?: ProfileInput; jdText?: string }>(req, 400_000);
      const jd = analyzeJd(requireJd(body.jdText));
      const profile = sanitizeProfile(body.profile as ProfileInput);
      const baseline = scoreResume(buildResume(profile, jd, { rewrite: false }).resume, jd);
      sendJson(res, 200, { jd, report: baseline });
    },
  },

  "POST /api/generate": {
    heavy: true,
    handler: async (req, res) => {
      const body = await readJson<{ profile?: ProfileInput; jdText?: string; pageSize?: string }>(req, 400_000);
      const jdText = requireJd(body.jdText);
      res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
      const send = (ev: StreamEvent) => res.write(JSON.stringify(ev) + "\n");
      try {
        const result = await generate(body.profile as ProfileInput, jdText, (index, status) => send({ type: "stage", index, status }), pageSizeOf(body.pageSize));
        send({ type: "result", result });
      } catch (e) {
        if (e instanceof UserError) send({ type: "error", message: e.message });
        else {
          log.error("generate_failed", { error: errorClass(e) });
          send({ type: "error", message: "Something went wrong while building your resume. Please try again." });
        }
      }
      res.end();
    },
  },

  "POST /api/score": {
    handler: async (req, res) => {
      const body = await readJson<{ resume?: unknown; jdText?: string; pageSize?: string }>(req, 400_000);
      const jd = analyzeJd(requireJd(body.jdText));
      const resume = sanitizeResume(body.resume);
      let pageCount = 1;
      try {
        pageCount = (await renderResumePdf(resume, pageSizeOf(body.pageSize))).pageCount;
      } catch (e) {
        log.error("pdf_measure_failed", { error: errorClass(e) });
      }
      sendJson(res, 200, { report: scoreResume(resume, jd, { pageCount }), pageCount });
    },
  },

  "POST /api/summary": {
    heavy: true,
    handler: async (req, res) => {
      const body = await readJson<{ profile?: ProfileInput; jdText?: string }>(req, 400_000);
      sendJson(res, 200, await generateSummary(body.profile as ProfileInput, requireJd(body.jdText)));
    },
  },

  "POST /api/export/pdf": {
    handler: async (req, res) => {
      const body = await readJson<{ resume?: unknown; pageSize?: string }>(req, 400_000);
      const resume = sanitizeResume(body.resume);
      if (!resume.contact.fullName.trim()) throw new UserError(400, "Add your name before downloading your resume.", "missing_name");
      let bytes: Uint8Array;
      try {
        bytes = (await renderResumePdf(resume, pageSizeOf(body.pageSize))).bytes;
      } catch (e) {
        log.error("pdf_render_failed", { error: errorClass(e) });
        throw new UserError(500, "We couldn't create your PDF. Please try again, or download the Word version instead.", "pdf_failed");
      }
      const name = resumeFilename(resume.contact.fullName, "pdf");
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Content-Length": bytes.length,
        "Cache-Control": "no-store",
      });
      res.end(Buffer.from(bytes));
    },
  },

  "POST /api/export/docx": {
    handler: async (req, res) => {
      const body = await readJson<{ resume?: unknown; pageSize?: string }>(req, 400_000);
      const resume = sanitizeResume(body.resume);
      if (!resume.contact.fullName.trim()) throw new UserError(400, "Add your name before downloading your resume.", "missing_name");
      let buf: Buffer;
      try {
        buf = await renderResumeDocx(resume, pageSizeOf(body.pageSize));
      } catch (e) {
        log.error("docx_render_failed", { error: errorClass(e) });
        throw new UserError(500, "We couldn't create your Word file. Please try again, or download the PDF instead.", "docx_failed");
      }
      res.writeHead(200, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${resumeFilename(resume.contact.fullName, "docx")}"`,
        "Content-Length": buf.length,
        "Cache-Control": "no-store",
      });
      res.end(buf);
    },
  },
};

/* ------------------------------ Static files ------------------------------ */

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".svg", ".json", ".txt"]);

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, urlPath: string): void {
  let rel = decodeURIComponent(urlPath);
  if (rel.includes("\0")) return sendError(res, 400, "Bad request.");
  const hasExt = path.extname(rel) !== "";
  if (!hasExt) rel = "/index.html"; // SPA routes
  const file = path.normalize(path.join(env.publicDir, rel));
  if (!file.startsWith(env.publicDir + path.sep)) return sendError(res, 403, "Forbidden.");
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(file);
    const headers: Record<string, string> = {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : /\/assets\//.test(rel) ? "public, max-age=31536000, immutable" : "public, max-age=86400",
    };
    const accept = String(req.headers["accept-encoding"] || "");
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(accept)) {
      headers["Content-Encoding"] = "gzip";
      headers["Vary"] = "Accept-Encoding";
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    } else {
      headers["Content-Length"] = String(st.size);
      res.writeHead(200, headers);
      fs.createReadStream(file).pipe(res);
    }
  });
}

/* --------------------------------- Server --------------------------------- */

export function createServer(): http.Server {
  return http.createServer(async (req, res) => {
    const started = Date.now();
    securityHeaders(res);
    const url = new URL(req.url || "/", "http://localhost");
    const key = `${req.method} ${url.pathname}`;
    res.on("finish", () => {
      if (url.pathname.startsWith("/api/")) log.info("request", { method: req.method, path: url.pathname, status: res.statusCode, ms: Date.now() - started });
    });

    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET" && req.method !== "HEAD") return sendError(res, 405, "Method not allowed.");
      return serveStatic(req, res, url.pathname);
    }
    const route = routes[key];
    if (!route) return sendError(res, 404, "Not found.", "not_found");

    const ip = clientIp(req);
    const limiter = route.heavy ? heavy : general;
    const rl = limiter.check(`${route.heavy ? "h" : "g"}:${ip}`);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter));
      return sendError(res, 429, `You're going a little fast. Please wait ${rl.retryAfter} seconds and try again.`, "rate_limited");
    }

    try {
      await route.handler(req, res);
    } catch (e) {
      if (e instanceof UserError) return sendError(res, e.status, e.message, e.code);
      log.error("unhandled", { path: url.pathname, error: errorClass(e) });
      sendError(res, 500, GENERIC_ERROR, "internal");
    }
  });
}

const isMain = process.argv[1] && /server\/(index|server)\.(ts|js|mjs)$|dist\/server\.m?js$/.test(process.argv[1].replace(/\\/g, "/"));
if (isMain) {
  const server = createServer();
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.listen(env.port, env.host, () => {
    log.info("listening", { port: env.port, ai: aiStatus().provider });
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
