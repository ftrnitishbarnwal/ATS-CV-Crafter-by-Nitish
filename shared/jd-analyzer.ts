import type { JdAnalysis, JdKeyword } from "./types";
import { findTerms, lookupTerm, displayForm } from "./skills-dictionary";
import { isKnownVerb, gerundToBase } from "./verbs";
import { normalizeSpace, stripBullet, wordCount } from "./util";

type Section = "required" | "preferred" | "responsibilities" | "about" | "benefits" | "unknown";

const HEADINGS: [Section, RegExp][] = [
  ["preferred", /(preferred|nice[\s-]to[\s-]have|bonus|good[\s-]to[\s-]have|desired|desirable|additional qualifications|it would be great|pluses|extra credit)/i],
  ["required", /(requirement|qualification|what you('|’)?ll need|what we('|’)?re looking for|who you are|must[\s-]haves?|skills|about you|you have|you bring|minimum|basic|required|experience|what you need|competenc|eligibility|profile)/i],
  ["responsibilities", /(responsibilit|what you('|’)?ll do|the role|your role|role overview|day[\s-]to[\s-]day|duties|accountabilit|you will|job description|what you will|in this role|key tasks|your impact|the opportunity)/i],
  ["benefits", /(benefit|perks|what we offer|compensation|salary|why join|why you('|’)?ll love|equal opportunity|eeo|diversity statement|we offer|location & ?pay)/i],
  ["about", /(about us|about the company|who we are|our company|company overview|about the team|our mission|about [A-Z])/i],
];

const DEPARTMENTS = new Set([
  "data engineering", "sales", "product management", "finance", "operations management", "customer success", "design", "graphic design",
  "product design", "marketing analytics", "digital marketing", "customer service", "business development", "data science", "research",
  "public relations", "accounting", "legal", "hr operations", "recruitment", "supply chain management", "quality assurance", "engineering",
]);

const PREFERRED_MARKER = /(preferred|nice[\s-]to[\s-]have|\ba plus\b|is a plus|bonus|good[\s-]to[\s-]have|desirable|ideally|advantageous|familiarity with)/i;

const ROLE_NOUNS = /\b(engineer|developer|manager|analyst|designer|scientist|specialist|consultant|lead|director|architect|coordinator|executive|associate|intern|administrator|officer|representative|accountant|writer|marketer|strategist|recruiter|technician|assistant|advisor|partner|head|president|vp|programmer|tester|researcher|editor|producer|nurse|teacher|instructor|trainer|owner|operator|agent|planner|buyer|controller|auditor|economist|attorney|paralegal|counsel|therapist|pharmacist|physician|clerk|supervisor|sre|devops|copywriter|artist|animator|photographer|chef|driver|cashier|receptionist|secretary|tutor|lecturer|professor|fellow|trainee|apprentice)s?\b/i;

const ACRONYM_STOP = new Set([
  "US", "USA", "UK", "EU", "CEO", "CTO", "CFO", "COO", "VP", "EEO", "EOE", "PTO", "WFH", "ETA", "FAQ", "OK", "AM", "PM", "IT", "HR",
  "ID", "NA", "TBD", "ASAP", "FYI", "ETC", "INC", "LLC", "LTD", "PVT", "API", "CV", "JD", "USD", "INR", "GBP", "EUR", "KM", "HQ",
  "BA", "BS", "MS", "MA", "MBA", "PHD", "BE", "ME", "BSC", "MSC", "ADA", "AI", "OR", "AND", "THE", "A", "I", "YOU", "WE", "IST",
  "EST", "PST", "UTC", "GMT", "NY", "SF", "LA", "DC", "CA", "TX", "WA", "MA", "IL", "YOE", "CTC", "LPA", "NDA", "Q1", "Q2", "Q3", "Q4",
]);

const PHRASE_STOP = new Set(
  (
    "a an the and or of to in on for with at by from as is are be been being was were will would should can could may might must " +
    "this that these those it its our your their we you they us them he she his her i my me who whom which what when where why how " +
    "experience years year ability able strong excellent good great solid proven demonstrated knowledge understanding skills skill " +
    "work working team teams including include includes related relevant etc across within plus also well other others new " +
    "including such like using use used via per based both each every all any some more most least high highly level levels " +
    "role roles position job candidate candidates company opportunity ideal equivalent minimum preferred required requirements " +
    "responsibilities qualifications familiarity proficiency proficient hands-on hands background degree field related preferably " +
    "least day days time full part closely fast paced environment dynamic passionate love join looking seeking help make ensure " +
    "provide support drive build develop manage lead create own deliver grow improve work-life benefits competitive salary " +
    "equal employer applicants regardless race religion gender age disability status veteran"
  ).split(/\s+/),
);

function classifyHeading(line: string): Section | null {
  const trimmed = line.trim();
  const t = trimmed.replace(/^[#*\s]+/, "").replace(/[:：\-–—*#_|]+\s*$/, "").trim();
  if (!t || wordCount(t) > 7 || /[.!?]$/.test(t)) return null;
  const words = t.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const titleCase = words.every((w) => /^[A-Z0-9&'’(]/.test(w) || /^(of|and|to|the|a|for|in|you|we|our|with|on|at)$/i.test(w));
  const looksLikeHeading = /[:：]\s*$/.test(trimmed) || /^#+\s/.test(trimmed) || /^\*\*.*\*\*$/.test(trimmed) || titleCase || t === t.toUpperCase();
  if (!looksLikeHeading) return null;
  for (const [sec, re] of HEADINGS) if (re.test(t)) return sec;
  return null;
}

function extractTitle(lines: string[], text: string): string {
  for (const l of lines.slice(0, 40)) {
    const m = l.match(/^(?:job\s*title|position|role|title|designation|opening)\s*[:：\-–]\s*(.{3,80})$/i);
    if (m) return cleanTitle(m[1]);
  }
  const lf = text.match(/(?:looking for|hiring|seeking|searching for|in search of)\s+(?:an?|the|our next|a talented|an experienced|a skilled)?\s*((?:[A-Z][\w/+.&-]*\s?){1,6})/);
  const fromSentence = lf && ROLE_NOUNS.test(lf[1]) ? cleanTitle(lf[1]) : "";
  for (const l of lines.slice(0, 8)) {
    const t = l.replace(/\s*[-–—|@(].*$/, "").trim();
    if (t && wordCount(t) <= 8 && ROLE_NOUNS.test(t) && !/[.!?]$/.test(t) && !/^(about|we|our|the company)/i.test(t)) return cleanTitle(t);
  }
  return fromSentence;
}

function cleanTitle(s: string): string {
  return normalizeSpace(s)
    .replace(/^(?:job\s*title|position|role)\s*[:：-]\s*/i, "")
    .replace(/\s+(?:to join|who|with|at|in|for|on)\b.*$/i, "")
    .replace(/[.,:;]+$/, "")
    .slice(0, 80);
}

const SENIORITY: [string, RegExp][] = [
  ["Intern", /\b(intern|internship|trainee)\b/i],
  ["Entry level", /\b(entry[\s-]level|junior|jr\.?|graduate|fresher|associate)\b/i],
  ["Director+", /\b(director|head of|vp|vice president|chief)\b/i],
  ["Manager", /\b(manager)\b/i],
  ["Lead / Principal", /\b(lead|principal|staff|architect)\b/i],
  ["Senior", /\b(senior|sr\.?)\b/i],
];

function extractYears(lines: string[]): number | null {
  let best: number | null = null;
  for (const l of lines) {
    const re = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?\+?\s*(?:years|yrs|year)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(l))) {
      const n = parseInt(m[1], 10);
      if (n > 0 && n <= 25 && !/(old|age)/i.test(l.slice(m.index, m.index + 40))) best = best == null ? n : Math.max(best, n);
    }
  }
  return best;
}

function extractEducation(text: string): string | null {
  if (/\b(ph\.?\s?d|doctorate)\b/i.test(text) && /\b(ph\.?\s?d|doctorate)\b.{0,40}(required|in)/i.test(text)) return "PhD";
  if (/\b(master'?s|m\.?\s?tech|m\.?s\.?\b|msc|m\.sc|mba|post[\s-]?graduate)\b/i.test(text) && !/\b(bachelor|b\.?tech|b\.?e\.?\b|bsc|b\.sc|undergraduate)\b/i.test(text)) return "Master's degree";
  if (/\b(bachelor'?s?|b\.?\s?tech|b\.?e\.?\b|b\.?s\.?\b|bsc|b\.sc|b\.com|bba|bca|undergraduate degree|graduate degree|degree in)\b/i.test(text)) return "Bachelor's degree";
  if (/\b(high school|12th|hsc|diploma)\b/i.test(text)) return "Diploma / High school";
  return null;
}

export function analyzeJd(rawText: string): JdAnalysis {
  const text = (rawText || "").replace(/\r/g, "").replace(/\t/g, " ");
  const rawLines = text.split("\n").map((l) => normalizeSpace(l)).filter(Boolean);
  const lines = rawLines.map((l) => stripBullet(l));

  // Tag each line with a section.
  let section: Section = "unknown";
  const tagged: { line: string; section: Section; bullet: boolean }[] = [];
  rawLines.forEach((raw, i) => {
    const isBullet = raw !== lines[i];
    const h = isBullet ? null : classifyHeading(raw) ?? classifyHeading(raw.split(/[:：]/)[0] + ":");
    if (h) {
      section = h;
      // "Requirements: 5+ years of Python" — keep content after the colon
      const after = raw.includes(":") ? raw.split(/[:：]/).slice(1).join(":").trim() : "";
      if (after) tagged.push({ line: after, section, bullet: false });
      return;
    }
    tagged.push({ line: lines[i], section, bullet: raw !== lines[i] });
  });

  // Dictionary terms per line
  const kw = new Map<string, JdKeyword>();
  for (const { line, section: sec } of tagged) {
    const hits = findTerms(line).filter((h) => {
      // "work with sales and product teams" names a department, not a required skill
      const after = line.slice(h.index + h.surface.length);
      const before = line.slice(0, h.index);
      if (DEPARTMENTS.has(h.entry.key) && /(?:partner|work|collaborat|liais|coordinat|align|interfac)\w*\s+(?:closely\s+)?with\s+(?:the\s+|our\s+)?$/i.test(before)) return false;
      return !/^\s+(?:and\s+[\w-]+\s+|&\s+[\w-]+\s+)?(?:teams?|department|org|organization|leaders|leadership|stakeholders|partners|counterparts|colleagues)\b/i.test(after);
    });
    const preferred = sec === "preferred" || PREFERRED_MARKER.test(line) || sec === "about" || sec === "benefits";
    for (const h of hits) {
      const existing = kw.get(h.entry.key);
      const importance = preferred ? "preferred" : "required";
      if (existing) {
        existing.count += h.count;
        if (importance === "required") existing.importance = "required";
      } else {
        kw.set(h.entry.key, {
          term: displayForm(h),
          canonical: h.entry.key,
          kind: h.entry.kind,
          importance,
          count: h.count,
          category: h.entry.category,
        });
      }
    }
  }

  // Acronyms / tech-looking tokens not in the dictionary (e.g. "SOC 2", "HVAC", "PySpark2")
  const coreLines = tagged.filter((t) => t.section !== "benefits" && t.section !== "about");
  for (const { line, section: sec } of coreLines) {
    const tokens = line.match(/\b[A-Z][A-Z0-9&/]{1,7}(?:[ -][A-Z][A-Z0-9]{1,7})*\b|\b[a-z]+[A-Z][A-Za-z0-9]+\b|\b[A-Z][a-z]+[A-Z][A-Za-z0-9]*\b/g) || [];
    const lineHits = findTerms(line).map((h) => h.surface.toLowerCase());
    for (const tok of tokens) {
      if (ACRONYM_STOP.has(tok.toUpperCase()) || tok.length < 2) continue;
      if (lineHits.some((sfc) => sfc.includes(tok.toLowerCase()))) continue;
      if (lookupTerm(tok)) continue;
      const key = tok.toLowerCase();
      if ([...kw.values()].some((k) => k.canonical === key || k.term.toLowerCase() === key)) {
        kw.get(key) && kw.get(key)!.count++;
        continue;
      }
      kw.set(key, {
        term: tok,
        canonical: key,
        kind: "skill",
        importance: sec === "preferred" || PREFERRED_MARKER.test(line) ? "preferred" : "required",
        count: 1,
        category: "Domain",
      });
    }
  }

  const title = extractTitle(lines, text);
  const titleLower = title.toLowerCase();
  // Domain phrases: repeated 2–3 word phrases of content words
  const phraseCounts = new Map<string, { display: string; count: number; required: boolean }>();
  const dictSpans = new Set([...kw.keys()]);
  for (const { line, section: sec } of coreLines) {
    const words = line.replace(/[()[\]{}"“”'’:;,!?]/g, " ").split(/\s+/).filter(Boolean);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const slice = words.slice(i, i + n);
        const lower = slice.map((w) => w.toLowerCase().replace(/\.$/, ""));
        if (lower.some((w) => PHRASE_STOP.has(w) || /^\d/.test(w) || w.length < 3)) continue;
        if (slice[slice.length - 1].endsWith(".") && n > 2) continue;
        const key = lower.join(" ");
        if (dictSpans.has(key) || lookupTerm(key) || findTerms(key).length || (titleLower && titleLower.includes(key))) continue;
        const cur = phraseCounts.get(key) || { display: slice.join(" ").replace(/\.$/, ""), count: 0, required: false };
        cur.count++;
        if (sec !== "preferred" && !PREFERRED_MARKER.test(line)) cur.required = true;
        phraseCounts.set(key, cur);
      }
    }
  }
  const domainTerms: string[] = [];
  [...phraseCounts.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || b[0].split(" ").length - a[0].split(" ").length)
    .forEach(([key, v]) => {
      if (domainTerms.length >= 8) return;
      // skip phrases contained in an already-selected longer phrase and vice versa
      if (domainTerms.some((d) => d.toLowerCase().includes(key) || key.includes(d.toLowerCase()))) return;
      domainTerms.push(v.display.toLowerCase());
      kw.set(key, { term: v.display.toLowerCase(), canonical: key, kind: "domain", importance: v.required ? "required" : "preferred", count: v.count });
    });

  // Order keywords by importance, then frequency; cap to a meaningful set.
  const all = [...kw.values()].sort((a, b) => {
    const imp = (k: JdKeyword) => (k.importance === "required" ? 2 : 1) * (k.kind === "soft" ? 0.6 : 1) * (k.kind === "domain" ? 0.8 : 1);
    return imp(b) * Math.log2(1 + b.count) - imp(a) * Math.log2(1 + a.count) || a.term.localeCompare(b.term);
  });
  const keywords = all.slice(0, 45);

  const respLines = tagged.filter((t) => t.section === "responsibilities" && wordCount(t.line) >= 4).map((t) => t.line);
  const actionVerbs: string[] = [];
  for (const l of respLines.length ? respLines : tagged.filter((t) => t.bullet).map((t) => t.line)) {
    const first = (l.split(/\s+/)[0] || "").replace(/[^A-Za-z]/g, "");
    if (!first || !isKnownVerb(first)) continue;
    const base = gerundToBase(first) ?? first.toLowerCase().replace(/(?<=[^s])s$/, "");
    const v = base.charAt(0).toUpperCase() + base.slice(1);
    if (!actionVerbs.includes(v)) actionVerbs.push(v);
  }

  const qualifications = tagged
    .filter((t) => /(certif|licen[cs]e|degree|bachelor|master|ph\.?d|cpa|cfa|acca|pmp|cissp|ccna|clearance)/i.test(t.line) && t.section !== "benefits")
    .map((t) => t.line.slice(0, 160))
    .slice(0, 6);

  const seniority = SENIORITY.find(([, re]) => re.test(title))?.[0] ?? SENIORITY.find(([, re]) => re.test(lines.slice(0, 5).join(" ")))?.[0] ?? "";

  return {
    title,
    seniority,
    keywords,
    requiredSkills: keywords.filter((k) => k.importance === "required" && k.kind !== "soft" && k.kind !== "domain").map((k) => k.term),
    preferredSkills: keywords.filter((k) => k.importance === "preferred" && k.kind !== "soft" && k.kind !== "domain").map((k) => k.term),
    softSkills: keywords.filter((k) => k.kind === "soft").map((k) => k.term),
    domainTerms,
    qualifications,
    responsibilities: respLines.slice(0, 12),
    actionVerbs: actionVerbs.slice(0, 12),
    minYears: extractYears(tagged.filter((t) => t.section !== "benefits" && t.section !== "about").map((t) => t.line)),
    educationRequirement: extractEducation(
      tagged.filter((t) => t.section !== "benefits" && t.section !== "preferred" && !PREFERRED_MARKER.test(t.line)).map((t) => t.line).join("\n"),
    ),
    wordCount: wordCount(text),
  };
}
