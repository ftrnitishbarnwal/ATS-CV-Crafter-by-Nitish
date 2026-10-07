/** Loose date parsing/formatting. Canonical storage: "YYYY-MM", "YYYY" or "". */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTH_WORD = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
export const DATE_TOKEN = `(?:${MONTH_WORD}\\.?,?\\s*'?\\d{2,4}|\\d{1,2}[/.-]\\d{4}|\\d{4}[/.-]\\d{1,2}|(?:19|20)\\d{2})`;
export const PRESENT_TOKEN = "(?:present|current(?:ly)?|now|till\\s+date|to\\s+date|ongoing|today)";
export const DATE_RANGE_RE = new RegExp(
  `(${DATE_TOKEN})\\s*(?:-|–|—|to|until|through|~)\\s*(${DATE_TOKEN}|${PRESENT_TOKEN})`,
  "i",
);

export function isPresentWord(s: string): boolean {
  return new RegExp(`^${PRESENT_TOKEN}$`, "i").test(s.trim());
}

/** Parse many human formats into "YYYY-MM" / "YYYY" / "". */
export function parseLooseDate(input: string): string {
  const s = (input || "").trim().toLowerCase().replace(/\.$/, "");
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return fmt(+m[1], +m[2]);
  m = s.match(/^(\d{4})[/.](\d{1,2})$/);
  if (m) return fmt(+m[1], +m[2]);
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/);
  if (m) return fmt(+m[2], +m[1]);
  m = s.match(new RegExp(`^(${MONTH_WORD})\\.?,?\\s*'?(\\d{2,4})$`, "i"));
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3)) + 1;
    let y = +m[2];
    if (m[2].length === 2) y = y > 50 ? 1900 + y : 2000 + y;
    return fmt(y, mi);
  }
  m = s.match(/^((?:19|20)\d{2})$/);
  if (m) return m[1];
  return "";
}

function fmt(y: number, mo: number): string {
  if (!y || y < 1950 || y > 2100) return "";
  if (!mo || mo < 1 || mo > 12) return String(y);
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/** "2021-03" -> "Mar 2021", "2021" -> "2021". Unknown input is returned trimmed. */
export function formatDate(d: string): string {
  const s = (d || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${MONTH_LABELS[+m[2] - 1]} ${m[1]}`;
  if (/^\d{4}$/.test(s)) return s;
  const parsed = parseLooseDate(s);
  return parsed ? formatDate(parsed) : s;
}

export function formatRange(start: string, end: string, current: boolean): string {
  const a = formatDate(start);
  const b = current ? "Present" : formatDate(end);
  if (a && b) return `${a} – ${b}`;
  return a || b || "";
}

/** Month index (months since year 0) for interval math. */
export function toMonthIndex(d: string, fallbackMonth = 1): number | null {
  const s = (d || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) return +m[1] * 12 + (+m[2] - 1);
  m = s.match(/^(\d{4})$/);
  if (m) return +m[1] * 12 + (fallbackMonth - 1);
  return null;
}

export function nowMonthIndex(now = new Date()): number {
  return now.getFullYear() * 12 + now.getMonth();
}

/** Total non-overlapping years across experiences. */
export function totalYears(items: { startDate: string; endDate: string; current: boolean }[], now = new Date()): number {
  const intervals: [number, number][] = [];
  for (const it of items) {
    const a = toMonthIndex(it.startDate, 1);
    const b = it.current ? nowMonthIndex(now) : toMonthIndex(it.endDate, 12);
    if (a == null || b == null || b < a) continue;
    intervals.push([a, b + 1]);
  }
  intervals.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of intervals) {
    if (!cur) cur = [...iv];
    else if (iv[0] <= cur[1]) cur[1] = Math.max(cur[1], iv[1]);
    else {
      total += cur[1] - cur[0];
      cur = [...iv];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round((total / 12) * 10) / 10;
}

/** Sort key: most recent first (current roles first). */
export function recencyKey(it: { startDate: string; endDate: string; current: boolean }): number {
  if (it.current) return 1e9 + (toMonthIndex(it.startDate) ?? 0);
  return toMonthIndex(it.endDate, 12) ?? toMonthIndex(it.startDate, 1) ?? 0;
}
