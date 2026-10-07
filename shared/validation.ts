import type { ProfileInput, Resume } from "./types";
import { wordCount, splitLines } from "./util";
import { toMonthIndex } from "./dates";

export const LIMITS = {
  jdMinWords: 30,
  jdMinChars: 150,
  jdMaxChars: 30000,
  fileMaxBytes: 5 * 1024 * 1024,
  fieldMax: 200,
  longFieldMax: 5000,
  maxEntries: 20,
};

export function validateJd(text: string): string | null {
  const t = (text || "").trim();
  if (!t) return "Paste the job description you're targeting to continue.";
  if (t.length > LIMITS.jdMaxChars) return `This job description is ${t.length.toLocaleString()} characters. Trim it to the role, responsibilities and requirements (max ${LIMITS.jdMaxChars.toLocaleString()} characters).`;
  if (wordCount(t) < LIMITS.jdMinWords || t.length < LIMITS.jdMinChars) {
    return `This looks too short to be a full job description (${wordCount(t)} word${wordCount(t) === 1 ? "" : "s"}). Paste the complete posting, including responsibilities and requirements.`;
  }
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  if (letters / t.length < 0.5) return "This doesn't look like a job description. Paste the text of the job posting.";
  return null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim());
}

export function isValidPhone(s: string): boolean {
  const digits = s.replace(/\D/g, "");
  return /^[+\d\s().-]+$/.test(s.trim()) && digits.length >= 7 && digits.length <= 15;
}

export function isValidUrl(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/\s/.test(t)) return false;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return /^https?:$/.test(u.protocol) && /\.[a-z]{2,}$/i.test(u.hostname);
  } catch {
    return false;
  }
}

export type FieldErrors = Record<string, string>;

export function validateContact(p: ProfileInput | Resume, errors: FieldErrors = {}): FieldErrors {
  const c = p.contact;
  if (!c.fullName.trim()) errors["contact.fullName"] = "Enter your full name.";
  else if (c.fullName.length > 80) errors["contact.fullName"] = "Name is too long.";
  if (!c.email.trim()) errors["contact.email"] = "Enter your email so recruiters can reach you.";
  else if (!isValidEmail(c.email)) errors["contact.email"] = "Enter a valid email, like name@example.com.";
  if (c.phone.trim() && !isValidPhone(c.phone)) errors["contact.phone"] = "Enter a valid phone number (digits, spaces, +, -, parentheses).";
  for (const k of ["linkedin", "github", "portfolio"] as const) {
    if (c[k].trim() && !isValidUrl(c[k])) errors[`contact.${k}`] = "Enter a valid URL, like linkedin.com/in/yourname.";
  }
  if (c.linkedin.trim() && isValidUrl(c.linkedin) && !/linkedin\.com/i.test(c.linkedin)) errors["contact.linkedin"] = "This should be a linkedin.com address.";
  if (c.github.trim() && isValidUrl(c.github) && !/github\.(com|io)/i.test(c.github)) errors["contact.github"] = "This should be a github.com address.";
  c.otherLinks.forEach((l, i) => {
    if (l.trim() && !isValidUrl(l)) errors[`contact.otherLinks.${i}`] = "Enter a valid URL.";
  });
  return errors;
}

export function validateExperience(p: ProfileInput, errors: FieldErrors = {}): FieldErrors {
  p.experience.forEach((e, i) => {
    const any = e.company || e.title || e.responsibilities || e.achievements || e.results;
    if (!any) return;
    if (!e.title.trim()) errors[`experience.${i}.title`] = "Add your job title.";
    if (!e.company.trim()) errors[`experience.${i}.company`] = "Add the company name.";
    const a = toMonthIndex(e.startDate);
    const b = e.current ? null : toMonthIndex(e.endDate, 12);
    if (a != null && b != null && b < a) errors[`experience.${i}.endDate`] = "End date is before the start date.";
    if (a != null && a > new Date().getFullYear() * 12 + new Date().getMonth() + 1) errors[`experience.${i}.startDate`] = "Start date is in the future.";
    const lines = [...splitLines(e.responsibilities), ...splitLines(e.achievements), ...splitLines(e.results)];
    if (!lines.length) errors[`experience.${i}.responsibilities`] = "Add at least one responsibility or achievement.";
  });
  return errors;
}

export function validateEducation(p: ProfileInput, errors: FieldErrors = {}): FieldErrors {
  p.education.forEach((e, i) => {
    if (!e.degree && !e.institution) return;
    if (!e.degree.trim()) errors[`education.${i}.degree`] = "Add the degree or qualification.";
    if (!e.institution.trim()) errors[`education.${i}.institution`] = "Add the institution.";
    if (e.startYear && e.endYear && /^\d{4}$/.test(e.startYear) && /^\d{4}$/.test(e.endYear) && +e.endYear < +e.startYear) {
      errors[`education.${i}.endYear`] = "End year is before the start year.";
    }
  });
  return errors;
}

export function validateProjects(p: ProfileInput, errors: FieldErrors = {}): FieldErrors {
  p.projects.forEach((x, i) => {
    if (!x.name && !x.description && !x.responsibilities) return;
    if (!x.name.trim()) errors[`projects.${i}.name`] = "Add a project name.";
    if (x.link.trim() && !isValidUrl(x.link)) errors[`projects.${i}.link`] = "Enter a valid URL.";
  });
  return errors;
}

export function validateCertifications(p: ProfileInput, errors: FieldErrors = {}): FieldErrors {
  p.certifications.forEach((c, i) => {
    if (!c.name && !c.issuer && !c.url) return;
    if (!c.name.trim()) errors[`certifications.${i}.name`] = "Add the certification name.";
    if (c.url.trim() && !isValidUrl(c.url)) errors[`certifications.${i}.url`] = "Enter a valid URL.";
  });
  return errors;
}

/** Full check before generation. Returns field errors plus a top-level message if content is missing. */
export function validateProfileForGeneration(p: ProfileInput): { errors: FieldErrors; message: string | null } {
  const errors: FieldErrors = {};
  validateContact(p, errors);
  validateExperience(p, errors);
  validateEducation(p, errors);
  validateProjects(p, errors);
  validateCertifications(p, errors);
  const hasContent =
    p.experience.some((e) => e.title || e.company) || p.education.some((e) => e.degree || e.institution) || p.projects.some((x) => x.name);
  let message: string | null = null;
  if (!hasContent) message = "Add at least one work experience, education entry or project so we have something to build your resume from.";
  else if (Object.keys(errors).length) message = "Some details need attention before we can build your resume.";
  return { errors, message };
}

/** Server-side guard against oversized payloads (defense in depth; the client enforces the same limits). */
export function profileSizeOk(p: unknown): boolean {
  try {
    return JSON.stringify(p).length < 200_000;
  } catch {
    return false;
  }
}

export function countWords(s: string): number {
  return wordCount(s);
}
