import type { IncomingMessage, ServerResponse } from "node:http";
import { env } from "./env";

/** An error whose message is safe to show to end users. */
export class UserError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "bad_request",
  ) {
    super(message);
    this.name = "UserError";
  }
}

export const GENERIC_ERROR = "Something went wrong while processing your request. Please try again.";

export function securityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  if (env.nodeEnv === "production") res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(data) });
  res.end(data);
}

export function sendError(res: ServerResponse, status: number, message: string, code = "error"): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  sendJson(res, status, { error: { message, code } });
}

export async function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > maxBytes) throw new UserError(413, tooLargeMessage(maxBytes), "too_large");
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    req.on("data", (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > maxBytes) {
        done = true;
        reject(new UserError(413, tooLargeMessage(maxBytes), "too_large"));
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!done) {
        done = true;
        resolve(Buffer.concat(chunks));
      }
    });
    req.on("error", (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
  });
}

function tooLargeMessage(max: number): string {
  return `This request is too large (limit ${Math.round(max / 1024 / 1024)} MB).`;
}

export async function readJson<T>(req: IncomingMessage, maxBytes = 1_000_000): Promise<T> {
  const ct = String(req.headers["content-type"] || "");
  if (!ct.includes("application/json")) throw new UserError(415, "Unsupported request format.", "unsupported_media_type");
  const buf = await readBody(req, maxBytes);
  try {
    return JSON.parse(buf.toString("utf8")) as T;
  } catch {
    throw new UserError(400, "The request could not be read. Please try again.", "invalid_json");
  }
}

export function clientIp(req: IncomingMessage): string {
  if (env.trustProxy) {
    const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (xf) return xf;
  }
  return req.socket.remoteAddress || "unknown";
}

/** Fixed-window in-memory rate limiter (per instance). Swap for Redis when running multiple instances. */
export class RateLimiter {
  private hits = new Map<string, { count: number; reset: number }>();
  constructor(
    private limit: number,
    private windowMs = 60_000,
  ) {
    setInterval(() => this.sweep(), this.windowMs).unref();
  }
  check(key: string): { ok: boolean; retryAfter: number } {
    const now = Date.now();
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return { ok: true, retryAfter: 0 };
    }
    cur.count++;
    return { ok: cur.count <= this.limit, retryAfter: Math.ceil((cur.reset - now) / 1000) };
  }
  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
  }
}
