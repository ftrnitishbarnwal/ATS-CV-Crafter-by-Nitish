import type { ProfileInput, ParseResult, JdAnalysis, AtsReport, Resume, PageSize, StreamEvent, GenerationResult } from "../../shared/types";

export class ApiError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

const NETWORK_MSG = "We couldn't reach the server. Check your internet connection and try again.";
const GENERIC_MSG = "Something went wrong while processing your request. Please try again.";

async function errorFrom(res: Response): Promise<ApiError> {
  try {
    const data = await res.json();
    const msg = data?.error?.message;
    if (typeof msg === "string" && msg) return new ApiError(msg, res.status);
  } catch {
    /* ignore */
  }
  if (res.status === 413) return new ApiError("This file or text is too large. Please upload a smaller file.", 413);
  if (res.status === 429) return new ApiError("You're going a little fast. Please wait a minute and try again.", 429);
  return new ApiError(GENERIC_MSG, res.status);
}

async function request(path: string, init: RequestInit, timeoutMs = 90_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    if (!res.ok) throw await errorFrom(res);
    return res;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === "AbortError") throw new ApiError("This is taking longer than expected. Please try again.");
    throw new ApiError(NETWORK_MSG);
  } finally {
    clearTimeout(t);
  }
}

function postJson(path: string, body: unknown, timeoutMs?: number): Promise<Response> {
  return request(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
}

export const api = {
  async health(): Promise<{ ai: { mode: "ai" | "local"; provider: string } }> {
    return (await request("/api/health", { method: "GET" }, 10_000)).json();
  },

  async analyzeJd(jdText: string): Promise<JdAnalysis> {
    return (await (await postJson("/api/jd", { jdText }, 20_000)).json()).jd;
  },

  async parseResume(file: File): Promise<ParseResult> {
    const res = await request(
      "/api/parse",
      { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file },
      120_000,
    );
    return res.json();
  },

  async analyze(profile: ProfileInput, jdText: string): Promise<{ jd: JdAnalysis; report: AtsReport }> {
    return (await postJson("/api/analyze", { profile, jdText }, 30_000)).json();
  },

  async summary(profile: ProfileInput, jdText: string): Promise<{ summary: string; engine: string; notice: string | null }> {
    return (await postJson("/api/summary", { profile, jdText }, 90_000)).json();
  },

  async score(resume: Resume, jdText: string, pageSize: PageSize): Promise<{ report: AtsReport; pageCount: number }> {
    return (await postJson("/api/score", { resume, jdText, pageSize }, 30_000)).json();
  },

  async exportFile(kind: "pdf" | "docx", resume: Resume, pageSize: PageSize): Promise<{ blob: Blob; filename: string }> {
    const res = await postJson(`/api/export/${kind}`, { resume, pageSize }, 60_000);
    const cd = res.headers.get("Content-Disposition") || "";
    const filename = /filename="([^"]+)"/.exec(cd)?.[1] || `Resume.${kind}`;
    const blob = await res.blob();
    if (!blob.size) throw new ApiError(kind === "pdf" ? "We couldn't create your PDF. Please try again." : "We couldn't create your Word file. Please try again.");
    return { blob, filename };
  },

  /** Streams real pipeline progress; resolves with the final result. */
  async generate(profile: ProfileInput, jdText: string, pageSize: PageSize, onStage: (index: number, status: "active" | "done") => void): Promise<GenerationResult> {
    const res = await postJson("/api/generate", { profile, jdText, pageSize }, 180_000);
    if (!res.body) throw new ApiError(GENERIC_MSG);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let result: GenerationResult | null = null;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "stage") onStage(ev.index, ev.status);
          else if (ev.type === "error") throw new ApiError(ev.message);
          else if (ev.type === "result") result = ev.result;
        }
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError("The connection was interrupted while building your resume. Please try again.");
    }
    if (!result) throw new ApiError("The connection was interrupted while building your resume. Please try again.");
    return result;
  },
};

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
