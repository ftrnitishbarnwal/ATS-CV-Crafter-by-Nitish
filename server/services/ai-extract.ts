/**
 * Converts AI-extracted resume JSON into a ProfileInput, keeping only values that are
 * actually present in the source text (grounding check). Anything unverifiable is dropped.
 */
import type { ProfileInput } from "../../shared/types";
import { emptyProfile, emptyExperience, emptyEducation, emptyProject, emptyCertification, uid, normalizeSpace } from "../../shared/util";
import { parseLooseDate } from "../../shared/dates";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9@+#%.]+/g, " ").replace(/\s+/g, " ").trim();
}

class Grounder {
  private text: string;
  private words: Set<string>;
  dropped = 0;
  constructor(source: string) {
    this.text = norm(source);
    this.words = new Set(this.text.split(" "));
  }
  /** Short fields (names, titles, companies): must appear as a phrase. */
  field(v: unknown): string {
    if (typeof v !== "string") return "";
    const s = normalizeSpace(v);
    if (!s) return "";
    const n = norm(s);
    if (!n || this.text.includes(n)) return s.slice(0, 200);
    this.dropped++;
    return "";
  }
  /** Long text (bullets, summary): 85% of words must come from the source. */
  prose(v: unknown): string {
    if (typeof v !== "string") return "";
    const s = normalizeSpace(v);
    const toks = norm(s).split(" ").filter(Boolean);
    if (!toks.length) return "";
    const hit = toks.filter((t) => this.words.has(t)).length / toks.length;
    if (hit >= 0.85) return s.slice(0, 1200);
    this.dropped++;
    return "";
  }
  date(v: unknown): string {
    if (typeof v !== "string" || !v.trim()) return "";
    const d = parseLooseDate(v);
    if (!d) return "";
    if (this.text.includes(d.slice(0, 4)) || this.text.includes(`'${d.slice(2, 4)}`)) return d;
    this.dropped++;
    return "";
  }
  list(v: unknown, kind: "field" | "prose" = "field"): string[] {
    return Array.isArray(v) ? v.map((x) => (kind === "field" ? this.field(x) : this.prose(x))).filter(Boolean) : [];
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);

export function groundAiProfile(raw: unknown, sourceText: string): { profile: ProfileInput; dropped: number } | null {
  const g = new Grounder(sourceText);
  const r = obj(raw);
  const p = emptyProfile();
  const c = obj(r.contact);
  p.contact.fullName = g.field(c.fullName);
  p.contact.title = g.field(c.title);
  p.contact.email = g.field(c.email);
  p.contact.phone = typeof c.phone === "string" && sourceText.replace(/\D/g, "").includes(c.phone.replace(/\D/g, "")) ? normalizeSpace(c.phone) : "";
  p.contact.location = g.field(c.location);
  p.contact.linkedin = g.field(c.linkedin);
  p.contact.github = g.field(c.github);
  p.contact.portfolio = g.field(c.portfolio);
  p.contact.otherLinks = g.list(c.otherLinks).slice(0, 4);
  p.summary = g.prose(r.summary);
  p.autoSummary = true;

  p.experience = arr(r.experience).map((e) => {
    const x = emptyExperience();
    x.company = g.field(e.company);
    x.title = g.field(e.title);
    x.location = g.field(e.location);
    x.startDate = g.date(e.startDate);
    x.current = e.current === true;
    x.endDate = x.current ? "" : g.date(e.endDate);
    x.responsibilities = g.list(e.bullets, "prose").join("\n");
    x.technologies = g.list(e.technologies).join(", ");
    return x;
  }).filter((x) => x.company || x.title);

  p.education = arr(r.education).map((e) => {
    const x = emptyEducation();
    x.degree = g.field(e.degree);
    x.institution = g.field(e.institution);
    x.location = g.field(e.location);
    x.startYear = g.date(e.startYear).slice(0, 4);
    x.endYear = g.date(e.endYear).slice(0, 4);
    x.grade = g.field(e.grade);
    x.coursework = g.prose(e.coursework);
    return x;
  }).filter((x) => x.degree || x.institution);

  for (const s of arr(r.skills)) {
    const items = g.list(s.items);
    if (items.length) p.skills.other.push({ id: uid("sk"), category: g.field(s.category) || "Skills", items: items.join(", ") });
  }

  p.projects = arr(r.projects).map((e) => {
    const x = emptyProject();
    x.name = g.field(e.name);
    x.description = g.prose(e.description);
    x.technologies = g.list(e.technologies).join(", ");
    x.responsibilities = g.list(e.bullets, "prose").join("\n");
    x.link = g.field(e.link);
    return x;
  }).filter((x) => x.name);

  p.certifications = arr(r.certifications).map((e) => {
    const x = emptyCertification();
    x.name = g.field(e.name);
    x.issuer = g.field(e.issuer);
    x.date = g.date(e.date);
    x.credentialId = g.field(e.credentialId);
    x.url = g.field(e.url);
    return x;
  }).filter((x) => x.name);

  p.achievements = g.list(r.achievements, "prose").join("\n");
  p.additional.Languages = g.list(r.languages).join("\n");
  p.additional["Volunteer Experience"] = g.list(r.volunteer, "prose").join("\n");
  p.additional.Publications = g.list(r.publications, "prose").join("\n");
  p.additional.Conferences = g.list(r.conferences, "prose").join("\n");
  p.additional["Professional Memberships"] = g.list(r.memberships, "prose").join("\n");
  p.additional.Interests = g.list(r.interests).join("\n");

  const useful = p.contact.fullName && (p.experience.length || p.education.length || p.projects.length);
  return useful ? { profile: p, dropped: g.dropped } : null;
}
