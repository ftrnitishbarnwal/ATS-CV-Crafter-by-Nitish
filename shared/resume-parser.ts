/**
 * Heuristic resume text parser (PDF/DOCX/TXT text -> ProfileInput).
 * It only extracts what is written; nothing is inferred beyond splitting and labelling.
 */
import type { ProfileInput, ExperienceInput, EducationInput, ProjectInput, CertificationInput, AdditionalKind } from "./types";
import { emptyProfile, emptyExperience, emptyEducation, emptyProject, emptyCertification, isBulletLine, stripBullet, normalizeSpace, wordCount, uid, uniqueCaseInsensitive } from "./util";
import { DATE_RANGE_RE, DATE_TOKEN, parseLooseDate, isPresentWord } from "./dates";
import { findTerms, lookupTerm } from "./skills-dictionary";

type SectionKey =
  | "header" | "summary" | "experience" | "education" | "skills" | "projects" | "certifications" | "achievements"
  | "languages" | "volunteer" | "publications" | "conferences" | "memberships" | "interests" | "unknown";

const SECTION_SYNONYMS: [SectionKey, string[]][] = [
  ["summary", ["summary", "professional summary", "profile", "professional profile", "career summary", "about me", "about", "objective", "career objective", "executive summary", "overview", "personal statement", "profile summary", "summary of qualifications", "professional overview"]],
  ["experience", ["experience", "work experience", "professional experience", "employment history", "employment", "work history", "career history", "relevant experience", "internships", "internship", "internship experience", "experience and internships", "work and internships", "professional background", "career experience", "industry experience"]],
  ["education", ["education", "academic background", "academic qualifications", "educational qualifications", "education and training", "academics", "academic details", "qualifications", "educational background", "academic profile"]],
  ["skills", ["skills", "technical skills", "key skills", "core skills", "core competencies", "competencies", "skills and tools", "technologies", "tech stack", "areas of expertise", "expertise", "tools", "skills summary", "technical proficiencies", "skill set", "skillset", "technical expertise", "tools and technologies", "skills and abilities", "professional skills", "it skills", "computer skills"]],
  ["projects", ["projects", "personal projects", "academic projects", "key projects", "selected projects", "project experience", "notable projects", "side projects", "project work"]],
  ["certifications", ["certifications", "certification", "certificates", "licenses and certifications", "licenses", "courses", "training and certifications", "certifications and training", "professional development", "courses and certifications", "online courses", "trainings"]],
  ["achievements", ["achievements", "awards", "honors", "honours", "awards and achievements", "accomplishments", "honors and awards", "key achievements", "awards and honors", "extracurricular activities", "extracurriculars", "extra curricular activities", "positions of responsibility", "leadership", "leadership and activities", "activities", "achievements and awards", "competitions"]],
  ["languages", ["languages", "language skills", "spoken languages", "languages known"]],
  ["volunteer", ["volunteer", "volunteering", "volunteer experience", "volunteer work", "community involvement", "community service", "social work"]],
  ["publications", ["publications", "research papers", "papers", "research", "research and publications"]],
  ["conferences", ["conferences", "talks", "speaking", "presentations", "conferences and talks"]],
  ["memberships", ["memberships", "professional memberships", "affiliations", "professional affiliations", "associations"]],
  ["interests", ["interests", "hobbies", "hobbies and interests", "personal interests", "interests and hobbies"]],
];

const SYNONYM_MAP = new Map<string, SectionKey>();
for (const [k, list] of SECTION_SYNONYMS) for (const s of list) SYNONYM_MAP.set(s, k);

function headingKey(line: string): { key: SectionKey; rest: string } | null {
  const raw = line.trim();
  if (!raw || raw.length > 60) return null;
  const [headPart, ...restParts] = raw.split(/[:：]/);
  const norm = (s: string) =>
    s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  const head = norm(headPart);
  if (!head || wordCount(head) > 5) return null;
  const key = SYNONYM_MAP.get(head);
  if (!key) return null;
  const rest = restParts.join(":").trim();
  // "Experience with Python..." (sentence) is not a heading; a heading has nothing after it or a colon list
  if (!raw.includes(":") && norm(raw) !== head) return null;
  return { key, rest };
}

const ROLE_NOUNS = /\b(engineer|developer|manager|analyst|designer|scientist|specialist|consultant|lead|director|architect|coordinator|executive|associate|intern|administrator|officer|representative|accountant|writer|marketer|strategist|recruiter|technician|assistant|advisor|head|president|vp|programmer|tester|researcher|editor|producer|nurse|teacher|instructor|trainer|founder|co-founder|owner|operator|agent|planner|buyer|controller|auditor|economist|attorney|paralegal|counsel|therapist|pharmacist|physician|clerk|supervisor|sre|copywriter|artist|animator|photographer|chef|cashier|receptionist|secretary|tutor|lecturer|professor|fellow|trainee|apprentice|volunteer|member|ambassador|mentor|captain|chair|chairperson|freelancer|contractor)s?\b/i;
const COMPANY_HINT = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co\.|company|technologies|technology|solutions|systems|labs|group|bank|university|college|institute|consulting|services|software|studios?|partners|foundation|agency|global|international|enterprises|industries|ventures|networks|health|hospital|capital)\b/i;
const CITY = /\b(remote|hybrid|on-?site|bengaluru|bangalore|mumbai|delhi|new delhi|hyderabad|pune|chennai|gurgaon|gurugram|noida|kolkata|ahmedabad|jaipur|kochi|chandigarh|indore|coimbatore|london|new york|san francisco|seattle|austin|boston|chicago|los angeles|singapore|dubai|toronto|berlin|sydney|paris|amsterdam|dublin|tokyo)\b/i;
const LOCATION_PATTERN = /^(?:[A-Z][a-zA-Z.'\s]{1,30}),\s*(?:[A-Z][a-zA-Z.\s]{1,30})$/;

function looksLikeLocation(s: string): boolean {
  const t = s.trim();
  if (!t || /\d/.test(t) || wordCount(t) > 5) return false;
  if (ROLE_NOUNS.test(t) || COMPANY_HINT.test(t)) return false;
  return /^(remote|hybrid|on-?site)$/i.test(t) || LOCATION_PATTERN.test(t) || (CITY.test(t) && wordCount(t) <= 4);
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d[\d\s.-]{6,14}\d/g;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9_%-]+\/?/i;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_-]+\/?/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s|,;<>()]+|\b[a-z0-9-]+\.(?:dev|io|me|com|net|org|in|co|app|page|site|tech|design|ai|xyz|us|uk)(?:\/[^\s|,;<>()]*)?/gi;

function findPhone(text: string): string {
  PHONE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PHONE_RE.exec(text))) {
    const cand = m[0].trim();
    const digits = cand.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    if (/^(19|20)\d{2}\s*[-–.]\s*(19|20)\d{2}$/.test(cand)) continue; // year range
    if (/^\d{1,2}[/.-]\d{4}/.test(cand)) continue; // dates
    return cand.replace(/\s+/g, " ");
  }
  return "";
}

/** Split on a separator, ignoring separators inside parentheses: "AWS (EC2, S3), Docker" -> ["AWS (EC2, S3)", "Docker"]. */
export function splitOutsideParens(s: string, sep: RegExp): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (depth === 0 && sep.test(ch)) {
      out.push(buf);
      buf = "";
    } else buf += ch;
  }
  out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

function cleanUrl(u: string): string {
  return u.replace(/[.)\]]+$/, "");
}

interface Line {
  text: string;
  bullet: boolean;
}

function toLines(text: string): Line[] {
  return text
    .replace(/\r/g, "")
    .replace(/\t+/g, "   ")
    .split("\n")
    .map((raw) => ({ raw, text: normalizeSpace(stripBullet(raw)), bullet: isBulletLine(raw) }))
    .filter((l) => l.text.length > 0 && !/^[\s\-_=•.·|]+$/.test(l.text))
    .map(({ text, bullet }) => ({ text, bullet }));
}

/** Merge wrapped lines back into their bullet/paragraph. */
function isContinuation(prev: string, cur: Line): boolean {
  if (cur.bullet) return false;
  if (DATE_RANGE_RE.test(cur.text)) return false;
  if (/^[a-z(&,]/.test(cur.text)) return true;
  if (/[.!?:]$/.test(prev)) return false;
  // Uppercase start: continuation only if previous line looked cut off mid-sentence
  return /(?:\b(?:and|or|of|to|the|a|an|in|for|with|by|on|at|from|using|across|into|over|via)|,)$/i.test(prev);
}

/* ------------------------------ Experience ------------------------------ */

interface RawEntry {
  header: string[];
  bullets: string[];
}

function groupEntries(lines: Line[], isHeaderStart: (l: Line, cur: RawEntry | null) => boolean): RawEntry[] {
  const entries: RawEntry[] = [];
  let cur: RawEntry | null = null;
  let lastWasBullet = false;
  for (const l of lines) {
    if (l.bullet) {
      if (!cur) {
        cur = { header: [], bullets: [] };
        entries.push(cur);
      }
      cur.bullets.push(l.text);
      lastWasBullet = true;
      continue;
    }
    if (cur && /^(?:tech(?:nologies|nology)?(?:\s*stack)?|tools(?:\s*(?:&|and)\s*technologies)?|environment|stack|skills used|built with)\s*[:\-–]/i.test(l.text)) {
      cur.bullets.push(l.text);
      continue;
    }
    if (cur && lastWasBullet && cur.bullets.length && isContinuation(cur.bullets[cur.bullets.length - 1], l)) {
      cur.bullets[cur.bullets.length - 1] += " " + l.text;
      continue;
    }
    if (!cur || lastWasBullet || isHeaderStart(l, cur)) {
      // A long sentence directly after bullets (no glyph) is another bullet, not a new header.
      if (cur && lastWasBullet && wordCount(l.text) > 10 && !DATE_RANGE_RE.test(l.text)) {
        cur.bullets.push(l.text);
        continue;
      }
      cur = { header: [l.text], bullets: [] };
      entries.push(cur);
      lastWasBullet = false;
      continue;
    }
    // Header continuation or glyph-less bullets
    if (cur.header.length >= 2 && wordCount(l.text) > 9) {
      if (cur.bullets.length && isContinuation(cur.bullets[cur.bullets.length - 1], l)) cur.bullets[cur.bullets.length - 1] += " " + l.text;
      else cur.bullets.push(l.text);
    } else if (wordCount(l.text) > 14 && !DATE_RANGE_RE.test(l.text)) {
      cur.bullets.push(l.text);
    } else {
      cur.header.push(l.text);
    }
  }
  return entries.filter((e) => e.header.length || e.bullets.length);
}

function extractDates(s: string): { start: string; end: string; current: boolean; rest: string } {
  const m = s.match(DATE_RANGE_RE);
  if (m) {
    const current = isPresentWord(m[2]);
    return {
      start: parseLooseDate(m[1]),
      end: current ? "" : parseLooseDate(m[2]),
      current,
      rest: normalizeSpace(s.replace(m[0], " ").replace(/[()[\]]/g, " ")),
    };
  }
  const single = s.match(new RegExp(`(?:since\\s+)?(${DATE_TOKEN})`, "i"));
  if (single) {
    const since = /since/i.test(single[0]);
    return {
      start: since ? parseLooseDate(single[1]) : "",
      end: since ? "" : parseLooseDate(single[1]),
      current: since,
      rest: normalizeSpace(s.replace(single[0], " ").replace(/[()[\]]/g, " ")),
    };
  }
  return { start: "", end: "", current: false, rest: s };
}

function splitParts(s: string): string[] {
  return s
    .split(/\s*(?:\||·|•|\s[—–-]\s|\s{3,}|\s@\s|\bat\b(?=\s+[A-Z]))\s*/)
    .map((p) => p.replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim())
    .filter(Boolean);
}

function interpretExperienceHeader(header: string[]): Pick<ExperienceInput, "title" | "company" | "location" | "startDate" | "endDate" | "current"> {
  let start = "", end = "", current = false;
  const cleaned: string[] = [];
  for (const h of header) {
    const d = extractDates(h);
    if ((d.start || d.end || d.current) && !start && !end && !current) {
      start = d.start; end = d.end; current = d.current;
      if (d.rest) cleaned.push(d.rest);
    } else cleaned.push(h);
  }
  let parts: string[] = [];
  for (const line of cleaned) parts.push(...splitParts(line));
  // Split "Company, City, ST" / "Title, Company" / "Title, Company, City"
  const splitComma = (p: string): string[] => {
    const comma = p.split(/,\s+/);
    if (comma.length < 2) return [p];
    const tail2 = comma.slice(-2).join(", ");
    const tail1 = comma[comma.length - 1];
    if (comma.length >= 3 && looksLikeLocation(tail2)) return [...splitComma(comma.slice(0, -2).join(", ")), tail2];
    if (looksLikeLocation(tail1)) return [...splitComma(comma.slice(0, -1).join(", ")), tail1];
    if (comma.length === 2 && ROLE_NOUNS.test(comma[0]) !== ROLE_NOUNS.test(comma[1])) return [comma[0], comma[1]];
    if (comma.length === 2 && COMPANY_HINT.test(comma[1]) && !COMPANY_HINT.test(comma[0])) return [comma[0], comma[1]];
    return [p];
  };
  const expanded = parts.flatMap(splitComma);
  parts = expanded.filter((p) => !/^(?:present|current)$/i.test(p));

  let location = "";
  const rest: string[] = [];
  for (const p of parts) {
    if (!location && looksLikeLocation(p)) location = p;
    else rest.push(p);
  }
  let title = "", company = "";
  const roleIdx = rest.findIndex((p) => ROLE_NOUNS.test(p) && !COMPANY_HINT.test(p));
  const roleIdx2 = roleIdx >= 0 ? roleIdx : rest.findIndex((p) => ROLE_NOUNS.test(p));
  if (roleIdx2 >= 0) {
    title = rest[roleIdx2];
    company = rest.find((p, i) => i !== roleIdx2) || "";
  } else if (rest.length >= 2) {
    company = rest[0];
    title = rest[1];
  } else if (rest.length === 1) {
    if (COMPANY_HINT.test(rest[0])) company = rest[0];
    else title = rest[0];
  }
  return { title: title.slice(0, 120), company: company.slice(0, 120), location, startDate: start, endDate: end, current };
}

function parseExperience(lines: Line[]): ExperienceInput[] {
  const headerStart = (l: Line, cur: RawEntry | null) => {
    if (!cur) return true;
    // A second date range means a new role under the same header block.
    const curHasDate = cur.header.some((h) => DATE_RANGE_RE.test(h));
    return DATE_RANGE_RE.test(l.text) && curHasDate && cur.header.length >= 1 && cur.bullets.length === 0 && cur.header.length >= 2;
  };
  const raws = groupEntries(lines, headerStart);
  const out: ExperienceInput[] = [];
  for (const r of raws) {
    if (!r.header.length && out.length) {
      // bullets without header belong to the previous role
      out[out.length - 1].responsibilities += (out[out.length - 1].responsibilities ? "\n" : "") + r.bullets.join("\n");
      continue;
    }
    const h = interpretExperienceHeader(r.header);
    const exp = emptyExperience();
    Object.assign(exp, h);
    const techLines: string[] = [];
    const bullets: string[] = [];
    for (const b of r.bullets) {
      const tm = b.match(/^(?:tech(?:nologies|nology)?(?:\s*stack)?|tools(?:\s*(?:&|and)\s*technologies)?|environment|stack|skills used)\s*[:\-–]\s*(.+)$/i);
      if (tm) techLines.push(tm[1]);
      else bullets.push(b);
    }
    exp.responsibilities = bullets.join("\n");
    exp.technologies = techLines.join(", ");
    if (exp.title || exp.company || exp.responsibilities) out.push(exp);
  }
  return out;
}

/* ------------------------------- Education ------------------------------ */

const DEGREE_RE = /\b(bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|b\.?\s?s\b|m\.?\s?s\b|b\.?\s?a\b|m\.?\s?a\b|b\.?\s?com|m\.?\s?com|bba|mba|bca|mca|ph\.?\s?d|doctorate|diploma|associate(?:'s)? degree|high school|higher secondary|senior secondary|secondary school|hsc|ssc|class\s*(?:x|xii|10|12)(?:th)?|12th|10th|a-levels|gcse|b\.?\s?arch|llb|llm|md|mbbs|pgdm|pgd|certificate in|b\.?\s?des|m\.?\s?des)\b/i;
const INSTITUTION_RE = /\b(university|college|institute|school|academy|iit|nit|iiit|iim|bits|polytechnic|vidyalaya|conservatory|universidad|universit[äé])\b/i;
const GRADE_RE = /\b(?:c?gpa|cpi|sgpa|percentage|grade|score|marks)\s*[:\-]?\s*([\d.]+\s*(?:\/\s*[\d.]+)?\s*%?)|(\b\d{2}(?:\.\d{1,2})?\s?%)/i;

function parseEducation(lines: Line[]): EducationInput[] {
  const out: EducationInput[] = [];
  let cur: EducationInput | null = null;
  const start = () => {
    cur = emptyEducation();
    out.push(cur);
    return cur;
  };
  for (const l of lines) {
    let t = l.text;
    const cw = t.match(/^(?:relevant\s+)?(?:coursework|courses|subjects)\s*[:\-–]\s*(.+)$/i);
    if (cw) {
      const c: EducationInput = cur ?? start();
      c.coursework = cw[1];
      continue;
    }
    const hasDegree = DEGREE_RE.test(t);
    const hasInst = INSTITUTION_RE.test(t);
    let c: EducationInput = cur ?? start();
    if ((hasDegree && c.degree) || (hasInst && c.institution && !hasDegree && c.degree)) c = start();
    const g = t.match(GRADE_RE);
    if (g && !c.grade) {
      c.grade = normalizeSpace(g[0]).replace(/^(c?gpa|cpi|percentage|grade|score|marks)\s*[:\-]?\s*/i, (m) => m.trim().replace(/[:\-]$/, "").toUpperCase().replace("PERCENTAGE", "Percentage").replace("MARKS", "Marks").replace("SCORE", "Score").replace("GRADE", "Grade") + ": ");
      t = t.replace(g[0], " ");
    }
    const d = extractDates(t);
    if (d.start || d.end || d.current) {
      if (!c.startYear && d.start) c.startYear = d.start.slice(0, 4);
      if (!c.endYear && (d.end || d.current)) c.endYear = d.current ? "Present" : d.end.slice(0, 4);
      t = d.rest;
    }
    const eduParts = splitParts(t).flatMap((part) =>
      DEGREE_RE.test(part) && part.includes(",") && (INSTITUTION_RE.test(part) || /,\s*(?:[A-Z]{2,6}\b|[A-Z][a-z]+\s+(?:of|de)\s)/.test(part)) ? splitOutsideParens(part, /,/) : [part],
    );
    for (const part of eduParts) {
      const p = part.replace(/^[,\s]+|[,\s]+$/g, "");
      if (!p) continue;
      if (c.degree && c.institution && !c.location && wordCount(p) <= 3 && !/\d/.test(p) && !DEGREE_RE.test(p)) {
        c.location = p;
        continue;
      }
      if (!c.degree && DEGREE_RE.test(p)) c.degree = p;
      else if (!c.institution && INSTITUTION_RE.test(p)) {
        const comma = p.split(/,\s+/);
        if (comma.length >= 2 && looksLikeLocation(comma.slice(1).join(", "))) {
          c.institution = comma[0];
          if (!c.location) c.location = comma.slice(1).join(", ");
        } else c.institution = p;
      } else if (!c.location && looksLikeLocation(p)) c.location = p;
      else if (!c.degree && !c.institution && wordCount(p) <= 12) c.institution = p;
      else if (c.degree && !/^(in|of)\b/i.test(p) && wordCount(p) <= 6 && !c.institution) c.institution = p;
      else if (c.degree && /^(in|of|major)\b/i.test(p)) c.degree += " " + p;
    }
  }
  return out.filter((e) => e.degree || e.institution);
}

/* -------------------------------- Skills -------------------------------- */

function assignSkills(profile: ProfileInput, lines: Line[]): void {
  const s = profile.skills;
  const add = (field: keyof Omit<typeof s, "other">, items: string[]) => {
    s[field] = uniqueCaseInsensitive([...(s[field] ? s[field].split(/,\s*/) : []), ...items]).join(", ");
  };
  for (const l of lines) {
    const m = l.text.match(/^([A-Za-z][A-Za-z &/+().-]{1,40}?)\s*[:\-–]\s+(.+)$/);
    const items = splitOutsideParens(m ? m[2] : l.text, /[,;|•·]/)
      .map((x) => x.replace(/\.$/, "").trim())
      .filter((x) => x && x.length <= 60);
    if (!items.length) continue;
    if (!m) {
      add("technical", items);
      continue;
    }
    const cat = m[1].toLowerCase();
    const langHits = items.filter((i) => lookupTerm(i)?.category === "Programming Languages").length;
    if (/language/.test(cat)) {
      if (langHits >= Math.ceil(items.length / 2)) add("languages", items);
      else profile.additional.Languages = uniqueCaseInsensitive([...profile.additional.Languages.split("\n"), ...items]).filter(Boolean).join("\n");
    } else if (/framework|librar/.test(cat)) add("frameworks", items);
    else if (/tool|software|application/.test(cat)) add("tools", items);
    else if (/platform|cloud|devops|infra/.test(cat)) add("platforms", items);
    else if (/soft|interpersonal|personal|behavio/.test(cat)) add("soft", items);
    else if (/domain|business|functional|industry/.test(cat)) add("domain", items);
    else if (/technical|tech|core|key|hard|programming|skills?$/.test(cat)) add("technical", items);
    else s.other.push({ id: uid("sk"), category: normalizeSpace(m[1]), items: items.join(", ") });
  }
}

/* ------------------------------- Projects ------------------------------- */

function parseProjects(lines: Line[]): ProjectInput[] {
  const raws = groupEntries(lines, (l, cur) => !cur || (!l.bullet && cur.bullets.length > 0));
  const out: ProjectInput[] = [];
  for (const r of raws) {
    const p = emptyProject();
    const descr: string[] = [];
    const header = [...r.header];
    const first = header.shift() || "";
    const parts = splitParts(extractDates(first).rest);
    for (const part of parts) {
      const url = part.match(URL_RE);
      if (url && !p.link) {
        p.link = cleanUrl(url[0]);
        continue;
      }
      if (!p.name) {
        p.name = part.replace(/[:\-–]\s*$/, "");
        continue;
      }
      const hits = findTerms(part);
      if (hits.length >= 1 && part.split(/,\s*/).length >= 2) p.technologies = part;
      else descr.push(part);
    }
    const bullets: string[] = [];
    for (const line of [...header, ...r.bullets]) {
      const tm = line.match(/^(?:tech(?:nologies|nology)?(?:\s*stack)?|tools|built with|stack|skills used)\s*[:\-–]\s*(.+)$/i);
      const url = line.match(/^(?:link|url|github|demo|live)\s*[:\-–]\s*(\S+)/i);
      if (tm) p.technologies = p.technologies ? `${p.technologies}, ${tm[1]}` : tm[1];
      else if (url) p.link = p.link || cleanUrl(url[1]);
      else if (r.header.includes(line) && !r.bullets.length) descr.push(line);
      else bullets.push(line);
    }
    p.description = descr.join(" ");
    p.responsibilities = bullets.join("\n");
    if (p.name || p.responsibilities) out.push(p);
  }
  return out;
}

/* ---------------------------- Certifications ---------------------------- */

function parseCertifications(lines: Line[]): CertificationInput[] {
  const merged = mergeParagraphs(lines);
  return merged.map((text) => {
    const c = emptyCertification();
    let t = text;
    const url = t.match(URL_RE);
    if (url) {
      c.url = cleanUrl(url[0]);
      t = t.replace(url[0], " ");
    }
    const id = t.match(/(?:credential|certificate|cert|license|licence)\s*(?:id|no\.?|number|#)\s*[:#]?\s*([A-Za-z0-9-]{4,})/i);
    if (id) {
      c.credentialId = id[1];
      t = t.replace(id[0], " ");
    }
    const d = extractDates(t);
    if (d.end || d.start) {
      c.date = d.end || d.start;
      t = d.rest;
    }
    let parts = splitOutsideParens(t, /[|,]/).flatMap((x) => x.split(/\s+(?:issued by|by|from)\s+/i)).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 1) {
      const dash = parts[0].match(/^(.+)\s[-–—]\s([^-–—]+)$/);
      if (dash && !/^(associate|professional|foundational|practitioner|expert|specialty|fundamentals|level\s*\d+|part\s*\d+|advanced|beginner|intermediate)$/i.test(dash[2].trim())) {
        parts = [dash[1].trim(), dash[2].trim()];
      }
    }
    c.name = (parts[0] || normalizeSpace(t)).replace(/[()]/g, "").trim();
    if (parts[1]) c.issuer = parts.slice(1).join(", ").replace(/[()]/g, "").trim();
    return c;
  }).filter((c) => c.name);
}

function mergeParagraphs(lines: Line[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (out.length && !l.bullet && isContinuation(out[out.length - 1], l)) out[out.length - 1] += " " + l.text;
    else out.push(l.text);
  }
  return out;
}

/* --------------------------------- Main --------------------------------- */

export interface HeuristicParse {
  profile: ProfileInput;
  detectedSections: string[];
  warnings: string[];
}

export function parseResumeText(text: string): HeuristicParse {
  const profile = emptyProfile();
  const warnings: string[] = [];
  const lines = toLines(text);
  const sections = new Map<SectionKey, Line[]>();
  const order: SectionKey[] = [];
  let current: SectionKey = "header";
  sections.set("header", []);
  for (const l of lines) {
    let h = l.bullet ? null : headingKey(l.text);
    // Inside Skills, "Languages: Python, Java" or "Tools: Git" is a category line, not a new section.
    if (h && h.rest && (current === "skills" || (h.key === "skills" && current !== "header"))) {
      if (current === "skills") h = null;
    }
    if (h) {
      current = h.key;
      if (!sections.has(current)) {
        sections.set(current, []);
        order.push(current);
      }
      if (h.rest) sections.get(current)!.push({ text: h.rest, bullet: false });
      continue;
    }
    sections.get(current)!.push(l);
  }

  // ---- Contact ----
  const header = sections.get("header")!;
  const headerText = header.map((l) => l.text).join("\n");
  const topText = lines.slice(0, 12).map((l) => l.text).join("\n");
  const fullText = lines.map((l) => l.text).join("\n");
  const c = profile.contact;
  c.email = (headerText.match(EMAIL_RE) || topText.match(EMAIL_RE) || fullText.match(EMAIL_RE) || [""])[0];
  c.phone = findPhone(headerText) || findPhone(topText);
  c.linkedin = cleanUrl((fullText.match(LINKEDIN_RE) || [""])[0]);
  c.github = cleanUrl((fullText.match(GITHUB_RE) || [""])[0]);
  const otherUrls = (headerText.match(URL_RE) || [])
    .map(cleanUrl)
    .filter((u) => !/linkedin\.com|github\.com/i.test(u) && !(c.email && c.email.toLowerCase().includes(u.toLowerCase().replace(/^https?:\/\/(www\.)?/, ""))) && !lookupTerm(u));
  if (otherUrls[0]) c.portfolio = otherUrls[0];
  c.otherLinks = otherUrls.slice(1, 4);

  const headerCandidates = (header.length ? header : lines.slice(0, 6)).slice(0, 8);
  for (const l of headerCandidates) {
    const parts = splitParts(l.text);
    for (const p of parts) {
      if (EMAIL_RE.test(p) || URL_RE.test(p) || findPhone(p)) {
        URL_RE.lastIndex = 0;
        continue;
      }
      URL_RE.lastIndex = 0;
      if (!c.fullName && /^[A-Za-z][A-Za-z.'’-]*(?:\s+[A-Za-z][A-Za-z.'’-]*){1,4}$/.test(p) && !ROLE_NOUNS.test(p) && !headingKey(p) && !CITY.test(p)) {
        c.fullName = p.split(/\s+/).map((w) => (w === w.toUpperCase() && w.length > 1 ? w.charAt(0) + w.slice(1).toLowerCase() : w)).join(" ");
        continue;
      }
      if (!c.location && looksLikeLocation(p)) {
        c.location = p;
        continue;
      }
      if (c.fullName && !c.title && ROLE_NOUNS.test(p) && wordCount(p) <= 10 && !/[.!?]$/.test(p)) c.title = p;
    }
  }

  // Text between header and first section that reads like a paragraph is a summary.
  const headerParagraph = header.filter((l) => wordCount(l.text) >= 12 && !EMAIL_RE.test(l.text)).map((l) => l.text);

  // ---- Sections ----
  const get = (k: SectionKey) => sections.get(k) || [];
  profile.summary = normalizeSpace([...(get("summary").length ? [] : headerParagraph), ...get("summary").map((l) => l.text)].join(" "));
  profile.autoSummary = true;
  profile.experience = parseExperience(get("experience"));
  profile.education = parseEducation(get("education"));
  assignSkills(profile, get("skills"));
  profile.projects = parseProjects(get("projects"));
  profile.certifications = parseCertifications(get("certifications"));
  profile.achievements = mergeParagraphs(get("achievements")).join("\n");
  const addl: [SectionKey, AdditionalKind][] = [
    ["languages", "Languages"], ["volunteer", "Volunteer Experience"], ["publications", "Publications"], ["conferences", "Conferences"],
    ["memberships", "Professional Memberships"], ["interests", "Interests"],
  ];
  for (const [k, kind] of addl) {
    const items = mergeParagraphs(get(k));
    if (k === "languages" || k === "interests") {
      const flat = items.flatMap((i) => i.split(/\s*[,;|•]\s*/)).filter(Boolean);
      profile.additional[kind] = uniqueCaseInsensitive([...profile.additional[kind].split("\n"), ...flat]).filter(Boolean).join("\n");
    } else profile.additional[kind] = items.join("\n");
  }

  // ---- Fallbacks for unstructured resumes ----
  if (!order.length) {
    warnings.push("We couldn't find standard section headings (like Experience or Education). Please review the extracted details carefully.");
    const body = lines.slice(Math.min(lines.length, 3));
    const dated = body.filter((l) => DATE_RANGE_RE.test(l.text));
    if (dated.length) profile.experience = parseExperience(body);
    if (!profile.summary) profile.summary = normalizeSpace(body.filter((l) => wordCount(l.text) >= 15).slice(0, 1).map((l) => l.text).join(" "));
  }
  const skillFields = [profile.skills.technical, profile.skills.languages, profile.skills.frameworks, profile.skills.tools, profile.skills.platforms].join("");
  if (!skillFields && !profile.skills.other.length) {
    // No skills section: list the skills the resume itself mentions (evidence-based, nothing added).
    const hits = findTerms(fullText).filter((h) => h.entry.kind !== "soft").map((h) => h.entry.canonical);
    if (hits.length) {
      profile.skills.technical = uniqueCaseInsensitive(hits).slice(0, 25).join(", ");
      warnings.push("No skills section was found, so we listed skills mentioned elsewhere in your resume. Please review them.");
    }
  }

  if (!c.fullName) warnings.push("We couldn't detect your name. Please add it.");
  if (!c.email) warnings.push("We couldn't find an email address. Please add one so recruiters can reach you.");
  if (!profile.experience.length && !profile.projects.length && !profile.education.length) {
    warnings.push("We couldn't identify experience, projects or education entries. Please review and add them.");
  }

  const labels: Record<string, string> = {
    summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects",
    certifications: "Certifications", achievements: "Achievements", languages: "Languages", volunteer: "Volunteer experience",
    publications: "Publications", conferences: "Conferences", memberships: "Memberships", interests: "Interests",
  };
  const detectedSections = ["Contact details", ...order.map((k) => labels[k]).filter(Boolean)];
  return { profile, detectedSections: uniqueCaseInsensitive(detectedSections), warnings };
}
