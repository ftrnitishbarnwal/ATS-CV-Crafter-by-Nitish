import type { ProfileInput, ExperienceInput, EducationInput, ProjectInput, CertificationInput } from "./types";

let idCounter = 0;
export function uid(prefix = "id"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rand}${idCounter}`;
}

export function emptyExperience(): ExperienceInput {
  return {
    id: uid("exp"),
    company: "",
    title: "",
    location: "",
    startDate: "",
    endDate: "",
    current: false,
    responsibilities: "",
    achievements: "",
    results: "",
    technologies: "",
  };
}

export function emptyEducation(): EducationInput {
  return { id: uid("edu"), degree: "", institution: "", location: "", startYear: "", endYear: "", grade: "", coursework: "" };
}

export function emptyProject(): ProjectInput {
  return { id: uid("prj"), name: "", description: "", technologies: "", responsibilities: "", outcomes: "", link: "" };
}

export function emptyCertification(): CertificationInput {
  return { id: uid("cert"), name: "", issuer: "", date: "", credentialId: "", url: "" };
}

export function emptyProfile(): ProfileInput {
  return {
    contact: {
      fullName: "",
      title: "",
      email: "",
      phone: "",
      location: "",
      linkedin: "",
      github: "",
      portfolio: "",
      otherLinks: [],
    },
    summary: "",
    autoSummary: true,
    experience: [],
    education: [],
    skills: { technical: "", languages: "", frameworks: "", tools: "", platforms: "", domain: "", soft: "", other: [] },
    projects: [],
    certifications: [],
    achievements: "",
    additional: {
      Languages: "",
      "Volunteer Experience": "",
      Publications: "",
      Conferences: "",
      "Professional Memberships": "",
      Interests: "",
    },
  };
}

/* ------------------------------ Text helpers ----------------------------- */

const BULLET_PREFIX = /^\s*(?:[•●▪■◦‣⁃➢➤►▶✓✔\-–—*·o]|\d{1,2}[.)])\s+/u;

export function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX, "").trim();
}

export function isBulletLine(line: string): boolean {
  return BULLET_PREFIX.test(line);
}

export function splitLines(text: string): string[] {
  return (text || "")
    .split(/\r?\n/)
    .map((l) => stripBullet(l).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function splitList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text || "").split(/[,;\n|•]+/)) {
    const v = raw.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function normalizeSpace(s: string): string {
  return (s || "").replace(/[  -​]/g, " ").replace(/\s+/g, " ").trim();
}

export function wordCount(s: string): number {
  const t = (s || "").trim();
  return t ? t.split(/\s+/).length : 0;
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function uniqueCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const v = normalizeSpace(i);
    if (!v) continue;
    const k = v.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

/** Number-like tokens (metrics) in a string: 40%, $2M, 1,200, 3x, 15+. */
export function extractNumbers(s: string): string[] {
  const m = (s || "").match(/[$₹€£]?\d[\d,.]*(?:%|\+|[ ]?(?:x|k|m|b|mm|bn|cr|lakhs?|crore)\b)?/gi) || [];
  return m.map((n) => n.toLowerCase().replace(/[\s,]/g, "").replace(/\.$/, "")).filter((n) => /\d/.test(n));
}

export function hasMetric(s: string): boolean {
  const t = (s || "").replace(/\b[A-Za-z]+\d+[A-Za-z0-9]*\b/g, " "); // ignore tokens like B2B, GA4, S3, EC2
  return /\d/.test(t) && /((?<![A-Za-z])\d+\s?%|[$₹€£]\s?\d|(?<![A-Za-z])\d+\s?(x|k|m|mm|bn|b)\b|(?<![A-Za-z])\d{2,}|\b\d+\+|\b\d+\s+(users|customers|clients|people|engineers|members|projects|hours|days|weeks|months|teams|reports|stores|countries|markets|accounts|leads|deals|tickets|applications|services|models|products|features|releases|students|employees|patients|cases|campaigns|vendors|partners))/i.test(t);
}
