import type { Resume, ProfileInput, JdAnalysis } from "./types";
import { formatRange } from "./dates";
import { splitLines, splitList } from "./util";

/** Flatten a resume into the plain text an ATS would extract (order mirrors the PDF). */
export function resumeToText(r: Resume): string {
  const out: string[] = [];
  const c = r.contact;
  out.push(c.fullName, c.title, [c.email, c.phone, c.location, c.linkedin, c.github, c.portfolio, ...c.otherLinks].filter(Boolean).join(" | "));
  for (const key of r.sectionOrder) {
    switch (key) {
      case "summary":
        if (r.summary) out.push("SUMMARY", r.summary);
        break;
      case "skills":
        if (r.skills.length) out.push("SKILLS", ...r.skills.map((g) => `${g.category}: ${g.items.join(", ")}`));
        break;
      case "experience":
        if (r.experience.length) {
          out.push("EXPERIENCE");
          for (const e of r.experience) {
            out.push(`${e.title} ${formatRange(e.startDate, e.endDate, e.current)}`, [e.company, e.location].filter(Boolean).join(", "));
            out.push(...e.bullets);
            if (e.technologies.length) out.push(`Technologies: ${e.technologies.join(", ")}`);
          }
        }
        break;
      case "projects":
        if (r.projects.length) {
          out.push("PROJECTS");
          for (const p of r.projects) {
            out.push([p.name, p.link].filter(Boolean).join(" | "), ...p.bullets);
            if (p.technologies.length) out.push(`Technologies: ${p.technologies.join(", ")}`);
          }
        }
        break;
      case "education":
        if (r.education.length) {
          out.push("EDUCATION");
          for (const e of r.education) out.push(e.degree, [e.institution, e.location].filter(Boolean).join(", "), [e.startYear, e.endYear].filter(Boolean).join(" – "), e.grade, e.coursework ? `Relevant coursework: ${e.coursework}` : "");
        }
        break;
      case "certifications":
        if (r.certifications.length) {
          out.push("CERTIFICATIONS");
          for (const x of r.certifications) out.push([x.name, x.issuer, x.date, x.credentialId].filter(Boolean).join(" | "));
        }
        break;
      case "achievements":
        if (r.achievements.length) out.push("ACHIEVEMENTS", ...r.achievements);
        break;
      case "additional":
        for (const s of r.additional) if (s.items.length) out.push(s.title.toUpperCase(), ...s.items);
        break;
    }
  }
  return out.filter(Boolean).join("\n");
}

/** Everything the user actually told us, as one searchable corpus (used by the fabrication guard). */
export function profileCorpus(p: ProfileInput): string {
  const parts: string[] = [
    ...Object.values(p.contact).flat(),
    p.summary,
    ...p.experience.flatMap((e) => [e.company, e.title, e.location, e.responsibilities, e.achievements, e.results, e.technologies]),
    ...p.education.flatMap((e) => [e.degree, e.institution, e.location, e.grade, e.coursework]),
    p.skills.technical, p.skills.languages, p.skills.frameworks, p.skills.tools, p.skills.platforms, p.skills.domain, p.skills.soft,
    ...p.skills.other.flatMap((o) => [o.category, o.items]),
    ...p.projects.flatMap((x) => [x.name, x.description, x.technologies, x.responsibilities, x.outcomes, x.link]),
    ...p.certifications.flatMap((x) => [x.name, x.issuer, x.credentialId]),
    p.achievements,
    ...Object.values(p.additional),
  ];
  return parts.filter(Boolean).join("\n");
}

/** Convert an edited Resume back into a ProfileInput so edits become the new source of truth. */
export function resumeToProfile(r: Resume): ProfileInput {
  const skills: ProfileInput["skills"] = { technical: "", languages: "", frameworks: "", tools: "", platforms: "", domain: "", soft: "", other: [] };
  for (const g of r.skills) skills.other.push({ id: g.id, category: g.category, items: g.items.join(", ") });
  const additional: ProfileInput["additional"] = {
    Languages: "", "Volunteer Experience": "", Publications: "", Conferences: "", "Professional Memberships": "", Interests: "",
  };
  for (const s of r.additional) if (s.title in additional) additional[s.title as keyof typeof additional] = s.items.join("\n");
  return {
    contact: { ...r.contact, otherLinks: [...r.contact.otherLinks] },
    summary: r.summary,
    autoSummary: false,
    experience: r.experience.map((e) => ({
      id: e.id, company: e.company, title: e.title, location: e.location, startDate: e.startDate, endDate: e.endDate, current: e.current,
      responsibilities: e.bullets.join("\n"), achievements: "", results: "", technologies: e.technologies.join(", "),
    })),
    education: r.education.map((e) => ({ ...e })),
    skills,
    projects: r.projects.map((p) => ({
      id: p.id, name: p.name, description: "", technologies: p.technologies.join(", "), responsibilities: p.bullets.join("\n"), outcomes: "", link: p.link,
    })),
    certifications: r.certifications.map((c) => ({ ...c })),
    achievements: r.achievements.join("\n"),
    additional,
  };
}

export function profileHasContent(p: ProfileInput): boolean {
  return (
    p.experience.some((e) => e.title || e.company || splitLines(e.responsibilities).length) ||
    p.education.some((e) => e.degree || e.institution) ||
    p.projects.some((x) => x.name) ||
    splitList([p.skills.technical, p.skills.languages, p.skills.frameworks, p.skills.tools].join(",")).length > 0
  );
}

export function jdTitleOrRole(jd: JdAnalysis): string {
  return jd.title || "the target role";
}
