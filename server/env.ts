import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader (no dependency). Real environment variables always win. */
function loadDotEnv(): void {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadDotEnv();

function num(name: string, def: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : def;
}

export const env = {
  port: num("PORT", 3000),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  /** "auto" uses Anthropic when a key is configured, otherwise the local engine. */
  aiProvider: (process.env.AI_PROVIDER || "auto").toLowerCase() as "auto" | "anthropic" | "local",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  anthropicBaseUrl: (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, ""),
  aiTimeoutMs: num("AI_TIMEOUT_MS", 60000),
  rateLimitPerMinute: num("RATE_LIMIT_PER_MINUTE", 60),
  aiRateLimitPerMinute: num("AI_RATE_LIMIT_PER_MINUTE", 8),
  trustProxy: process.env.TRUST_PROXY === "true",
  publicDir: path.resolve(process.cwd(), process.env.PUBLIC_DIR || "dist/public"),
};

export function aiEnabled(): boolean {
  if (env.aiProvider === "local") return false;
  return !!env.anthropicApiKey;
}
