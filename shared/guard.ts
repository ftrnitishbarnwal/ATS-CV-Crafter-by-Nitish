/**
 * Fabrication guard. AI-written text is accepted only if every metric, known skill/tool and
 * proper noun in it can be traced back to the user's own material.
 */
import type { GuardNote } from "./types";
import { extractNumbers, wordCount, normalizeSpace } from "./util";
import { findTerms } from "./skills-dictionary";

const COMMON_CAPS = new Set([
  "i", "a", "an", "the", "and", "or", "of", "to", "in", "on", "for", "with", "at", "by", "from", "as", "into", "across", "over",
  "api", "apis", "ui", "ux", "kpi", "kpis", "q1", "q2", "q3", "q4", "ceo", "cto", "vp", "hr", "it", "b2b", "b2c", "saas", "us", "eu",
  "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
]);

export interface GuardContext {
  corpusLower: string;
  corpusNumbers: Set<string>;
  corpusTermKeys: Set<string>;
  corpusWords: Set<string>;
}

export function buildGuardContext(corpus: string): GuardContext {
  const lower = corpus.toLowerCase();
  return {
    corpusLower: lower,
    corpusNumbers: new Set(extractNumbers(corpus).map(numKey)),
    corpusTermKeys: new Set(findTerms(corpus).map((h) => h.entry.key)),
    corpusWords: new Set(lower.split(/[^a-z0-9+#.&-]+/).filter(Boolean)),
  };
}

function numKey(n: string): string {
  return n.replace(/[$₹€£+,]/g, "").replace(/\.0+$/, "");
}

export interface GuardVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * @param candidate  AI-produced text
 * @param local      the specific source text it rewrites (e.g. the original bullet) – numbers must come from here or the corpus
 * @param allowedExtraNumbers numbers we computed ourselves (e.g. years of experience)
 */
export function checkText(candidate: string, ctx: GuardContext, local = "", allowedExtraNumbers: string[] = []): GuardVerdict {
  const text = normalizeSpace(candidate);
  if (!text) return { ok: false, reason: "empty" };

  // 1. Metrics must already exist in the user's material.
  const localNums = new Set(extractNumbers(local).map(numKey));
  const allowed = new Set(allowedExtraNumbers.map(numKey));
  for (const n of extractNumbers(text).map(numKey)) {
    const bare = n.replace(/[%xkmb]+$|mm$|bn$/i, "");
    const ok = localNums.has(n) || ctx.corpusNumbers.has(n) || allowed.has(n) || allowed.has(bare) ||
      [...ctx.corpusNumbers].some((c) => c.replace(/[%xkmb+]+$/i, "") === bare && bare.length > 0);
    if (!ok) return { ok: false, reason: `introduced a number (${n}) that isn't in your information` };
  }

  // 2. Known skills/tools must be evidenced by the user's material.
  for (const h of findTerms(text)) {
    if (!ctx.corpusTermKeys.has(h.entry.key)) return { ok: false, reason: `mentioned "${h.surface}", which isn't in your information` };
  }

  // 3. Capitalized names (companies, products, places) must appear in the user's material.
  const tokens = text.split(/\s+/);
  for (let i = 1; i < tokens.length; i++) {
    const raw = tokens[i].replace(/^[("'“]+|[)"'”.,;:!?]+$/g, "");
    if (!/^[A-Z][A-Za-z0-9&.+#-]{2,}$/.test(raw)) continue;
    const prev = tokens[i - 1];
    if (/[.!?:]$/.test(prev)) continue; // sentence start
    const w = raw.toLowerCase();
    if (COMMON_CAPS.has(w) || ctx.corpusWords.has(w) || ctx.corpusLower.includes(w)) continue;
    return { ok: false, reason: `introduced the name "${raw}", which isn't in your information` };
  }

  // 4. Don't let a rewrite balloon beyond the source.
  if (local && wordCount(text) > wordCount(local) * 2 + 15) return { ok: false, reason: "expanded far beyond the original" };
  return { ok: true };
}

export function note(location: string, reason: string): GuardNote {
  return { location, reason };
}
