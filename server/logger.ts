/**
 * Privacy-conscious logger: request metadata and error classes only.
 * Never pass resume text, job descriptions or personal data to these functions.
 */
type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, meta?: Record<string, string | number | boolean | undefined>): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  if (level === "error") console.error(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, string | number | boolean | undefined>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, string | number | boolean | undefined>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, string | number | boolean | undefined>) => write("error", msg, meta),
};

/** Reduce an unknown error to a safe, content-free description. */
export function errorClass(e: unknown): string {
  if (e instanceof Error) return `${e.name}${(e as { code?: string }).code ? `:${(e as { code?: string }).code}` : ""}`;
  return typeof e;
}
