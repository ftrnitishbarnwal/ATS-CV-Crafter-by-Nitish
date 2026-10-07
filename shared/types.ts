/**
 * Core data model shared by client and server.
 *
 * ProfileInput  – the raw facts a user gave us (typed into the form or parsed from an upload).
 * Resume        – the optimized, render-ready document. Everything in it must be traceable
 *                 back to ProfileInput; the optimizer may reword, reorder and trim, never invent.
 */

export interface ContactInfo {
  fullName: string;
  title: string; // professional title / desired role
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  portfolio: string;
  otherLinks: string[];
}

/** Dates are stored as "YYYY-MM" or "YYYY" (or "" when unknown). */
export interface ExperienceInput {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  responsibilities: string; // one item per line
  achievements: string; // one item per line
  results: string; // quantifiable results, one per line
  technologies: string; // comma separated
}

export interface EducationInput {
  id: string;
  degree: string;
  institution: string;
  location: string;
  startYear: string;
  endYear: string;
  grade: string;
  coursework: string;
}

export interface SkillsInput {
  technical: string;
  languages: string; // programming languages
  frameworks: string;
  tools: string;
  platforms: string;
  domain: string;
  soft: string;
  /** Extra categories parsed from an uploaded resume ("Category: a, b"). */
  other: { id: string; category: string; items: string }[];
}

export interface ProjectInput {
  id: string;
  name: string;
  description: string;
  technologies: string;
  responsibilities: string;
  outcomes: string;
  link: string;
}

export interface CertificationInput {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId: string;
  url: string;
}

export type AdditionalKind =
  | "Languages"
  | "Volunteer Experience"
  | "Publications"
  | "Conferences"
  | "Professional Memberships"
  | "Interests";

export const ADDITIONAL_KINDS: AdditionalKind[] = [
  "Languages",
  "Volunteer Experience",
  "Publications",
  "Conferences",
  "Professional Memberships",
  "Interests",
];

export interface ProfileInput {
  contact: ContactInfo;
  summary: string;
  autoSummary: boolean;
  experience: ExperienceInput[];
  education: EducationInput[];
  skills: SkillsInput;
  projects: ProjectInput[];
  certifications: CertificationInput[];
  achievements: string; // one per line
  additional: Record<AdditionalKind, string>; // one item per line
}

/* ---------------------------- Output document ---------------------------- */

export interface ResumeExperience {
  id: string;
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  bullets: string[];
  technologies: string[];
}

export interface ResumeEducation {
  id: string;
  degree: string;
  institution: string;
  location: string;
  startYear: string;
  endYear: string;
  grade: string;
  coursework: string;
}

export interface ResumeSkillGroup {
  id: string;
  category: string;
  items: string[];
}

export interface ResumeProject {
  id: string;
  name: string;
  link: string;
  technologies: string[];
  bullets: string[];
}

export interface ResumeCertification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialId: string;
  url: string;
}

export interface ResumeSection {
  id: string;
  title: string;
  items: string[];
}

export type SectionKey =
  | "summary"
  | "skills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "achievements"
  | "additional";

export interface Resume {
  contact: ContactInfo;
  summary: string;
  skills: ResumeSkillGroup[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  education: ResumeEducation[];
  certifications: ResumeCertification[];
  achievements: string[];
  additional: ResumeSection[];
  sectionOrder: SectionKey[];
}

/* ------------------------------ JD analysis ------------------------------ */

export interface JdKeyword {
  term: string; // display form as written in the JD
  canonical: string; // lower-case canonical key
  kind: "skill" | "tool" | "soft" | "domain" | "qualification";
  importance: "required" | "preferred";
  count: number;
  category?: string;
}

export interface JdAnalysis {
  title: string;
  seniority: string;
  keywords: JdKeyword[];
  requiredSkills: string[];
  preferredSkills: string[];
  softSkills: string[];
  domainTerms: string[];
  qualifications: string[];
  responsibilities: string[];
  actionVerbs: string[];
  minYears: number | null;
  educationRequirement: string | null;
  wordCount: number;
}

/* ------------------------------- Scoring -------------------------------- */

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  max: number;
  detail: string;
}

export interface Insight {
  severity: "high" | "medium" | "low";
  area: string;
  message: string;
}

export interface KeywordMatch {
  term: string;
  importance: "required" | "preferred";
  kind: JdKeyword["kind"];
  found: boolean;
  inSkills: boolean;
  inExperience: boolean;
}

export interface AtsReport {
  total: number;
  components: ScoreComponent[];
  keywordMatches: KeywordMatch[];
  weakAreas: Insight[];
  suggestions: Insight[];
  stats: {
    bulletCount: number;
    quantifiedBullets: number;
    strongVerbBullets: number;
    yearsOfExperience: number;
    wordCount: number;
  };
}

/* ------------------------------- Pipeline ------------------------------- */

export interface GuardNote {
  location: string;
  reason: string;
}

export interface GenerationResult {
  resume: Resume;
  jd: JdAnalysis;
  report: AtsReport;
  baseline: AtsReport;
  engine: "ai" | "local";
  engineNotice: string | null;
  guardNotes: GuardNote[];
  changes: string[];
  pageCount: number;
}

export interface ParseResult {
  profile: ProfileInput;
  detectedSections: string[];
  warnings: string[];
  textLength: number;
  engine: "ai" | "local";
}

export const GENERATION_STAGES = [
  "Reading your information",
  "Analyzing the target job",
  "Identifying important keywords",
  "Matching your experience",
  "Optimizing resume structure",
  "Improving bullet points",
  "Checking ATS compatibility",
  "Formatting your resume",
  "Running final quality checks",
] as const;

export type StreamEvent =
  | { type: "stage"; index: number; status: "active" | "done" }
  | { type: "result"; result: GenerationResult }
  | { type: "error"; message: string };

export type PageSize = "A4" | "Letter";
