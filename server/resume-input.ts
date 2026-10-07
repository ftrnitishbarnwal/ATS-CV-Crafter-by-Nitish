import type { Resume, SectionKey, PageSize } from "../shared/types";
import { ADDITIONAL_KINDS } from "../shared/types";

const SECTION_KEYS: SectionKey[] = ["summary", "skills", "experience", "projects", "education", "certifications", "achievements", "additional"];

/** Coerce untrusted JSON into a well-formed Resume with bounded sizes. */
export function sanitizeResume(input: unknown): Resume {
  const r = (input && typeof input === "object" ? input : {}) as Partial<Resume>;
  const s = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");
  const list = (v: unknown, max = 30, n = 600) => (Array.isArray(v) ? v.slice(0, max).map((x) => s(x, n)).filter((x) => x.trim()) : []);
  const arr = <T>(v: unknown, max = 20): Partial<T>[] => (Array.isArray(v) ? (v.slice(0, max) as Partial<T>[]) : []);
  const c = (r.contact ?? {}) as Partial<Resume["contact"]>;
  const order = Array.isArray(r.sectionOrder) ? r.sectionOrder.filter((k): k is SectionKey => SECTION_KEYS.includes(k as SectionKey)) : [];
  return {
    contact: {
      fullName: s(c.fullName, 100), title: s(c.title, 150), email: s(c.email, 150), phone: s(c.phone, 40), location: s(c.location, 120),
      linkedin: s(c.linkedin, 200), github: s(c.github, 200), portfolio: s(c.portfolio, 200), otherLinks: list(c.otherLinks, 4, 200),
    },
    summary: s(r.summary, 2000),
    skills: arr<Resume["skills"][number]>(r.skills).map((g, i) => ({ id: s(g.id) || `sg${i}`, category: s(g.category, 80) || "Skills", items: list(g.items, 40, 80) })).filter((g) => g.items.length),
    experience: arr<Resume["experience"][number]>(r.experience).map((e, i) => ({
      id: s(e.id) || `e${i}`, company: s(e.company, 150), title: s(e.title, 150), location: s(e.location, 120), startDate: s(e.startDate, 20),
      endDate: s(e.endDate, 20), current: e.current === true, bullets: list(e.bullets, 15, 600), technologies: list(e.technologies, 30, 60),
    })),
    projects: arr<Resume["projects"][number]>(r.projects).map((p, i) => ({
      id: s(p.id) || `p${i}`, name: s(p.name, 150), link: s(p.link, 200), technologies: list(p.technologies, 30, 60), bullets: list(p.bullets, 10, 600),
    })),
    education: arr<Resume["education"][number]>(r.education).map((e, i) => ({
      id: s(e.id) || `ed${i}`, degree: s(e.degree, 200), institution: s(e.institution, 200), location: s(e.location, 120), startYear: s(e.startYear, 10),
      endYear: s(e.endYear, 10), grade: s(e.grade, 60), coursework: s(e.coursework, 600),
    })),
    certifications: arr<Resume["certifications"][number]>(r.certifications).map((x, i) => ({
      id: s(x.id) || `c${i}`, name: s(x.name, 200), issuer: s(x.issuer, 150), date: s(x.date, 20), credentialId: s(x.credentialId, 80), url: s(x.url, 200),
    })),
    achievements: list(r.achievements, 15, 400),
    additional: arr<Resume["additional"][number]>(r.additional, 6)
      .filter((x) => ADDITIONAL_KINDS.includes(x.title as (typeof ADDITIONAL_KINDS)[number]))
      .map((x) => ({ id: s(x.id) || s(x.title), title: s(x.title), items: list(x.items, 15, 400) })),
    sectionOrder: order.length ? order : SECTION_KEYS,
  };
}

export function pageSizeOf(v: unknown): PageSize {
  return v === "Letter" ? "Letter" : "A4";
}

/** "Priya Sharma" -> "Priya_Sharma_Resume.pdf" (ASCII-safe). */
export function resumeFilename(fullName: string, ext: "pdf" | "docx"): string {
  const parts = (fullName || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .map((p) => p.replace(/[^A-Za-z0-9-]/g, ""))
    .filter(Boolean);
  const first = parts[0] || "My";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return `${[first, last].filter(Boolean).join("_")}_Resume.${ext}`;
}
