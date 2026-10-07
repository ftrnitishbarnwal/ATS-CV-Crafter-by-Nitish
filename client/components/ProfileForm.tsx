import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { LuPlus, LuTrash2, LuArrowLeft, LuWandSparkles, LuCheck, LuCircle } from "react-icons/lu";
import { useBuilder } from "../lib/store";
import { api } from "../lib/api";
import type { ProfileInput, ExperienceInput, EducationInput, ProjectInput, CertificationInput, AdditionalKind } from "../../shared/types";
import { ADDITIONAL_KINDS } from "../../shared/types";
import { emptyExperience, emptyEducation, emptyProject, emptyCertification, splitList, uid } from "../../shared/util";
import { textHasTerm } from "../../shared/skills-dictionary";
import { profileCorpus } from "../../shared/resume-text";
import {
  validateContact, validateExperience, validateEducation, validateProjects, validateCertifications, validateProfileForGeneration, type FieldErrors,
} from "../../shared/validation";
import { TextField, TextAreaField, MonthYearField, Notice, Spinner } from "./ui";
import { JdSummary } from "./Steps";

const STEPS = ["Personal", "Summary", "Experience", "Education", "Skills", "Projects", "Certifications & awards", "Additional"] as const;

type Patch = (fn: (p: ProfileInput) => ProfileInput) => void;

function stepErrors(step: number, p: ProfileInput): FieldErrors {
  switch (step) {
    case 0:
      return validateContact(p);
    case 2:
      return validateExperience(p);
    case 3:
      return validateEducation(p);
    case 5:
      return validateProjects(p);
    case 6:
      return validateCertifications(p);
    default:
      return {};
  }
}

const STEP_OF_FIELD = (key: string): number =>
  key.startsWith("contact.") ? 0 : key.startsWith("experience.") ? 2 : key.startsWith("education.") ? 3 : key.startsWith("projects.") ? 5 : key.startsWith("certifications.") ? 6 : 0;

export function ProfileForm() {
  const { state, patch, go } = useBuilder();
  const step = Math.min(state.formStep, STEPS.length - 1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topError, setTopError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const p = state.profile;
  const update: Patch = (fn) => patch((s) => ({ profile: fn(s.profile) }));

  useEffect(() => {
    titleRef.current?.focus();
  }, [step]);

  // Once errors are shown, re-check as the user types so fixed fields clear immediately.
  useEffect(() => {
    if (!Object.keys(errors).length) return;
    const next = stepErrors(step, p);
    setErrors(next);
    if (!Object.keys(next).length) setTopError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const setStep = (n: number) => {
    setErrors({});
    setTopError(null);
    patch({ formStep: n });
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    const errs = stepErrors(step, p);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTopError("Fix the highlighted fields to continue.");
      return;
    }
    if (step < STEPS.length - 1) setStep(step + 1);
    else build();
  };

  const build = () => {
    const { errors: errs, message } = validateProfileForGeneration(p);
    if (message) {
      const first = Object.keys(errs)[0];
      const target = first ? STEP_OF_FIELD(first) : 2;
      setErrors(errs);
      setTopError(message);
      if (target !== step) patch({ formStep: target });
      window.scrollTo({ top: 0 });
      return;
    }
    go("generating", { returnStep: "form" });
  };

  const done = useMemo(() => {
    const d: boolean[] = [];
    d[0] = !!(p.contact.fullName && p.contact.email);
    d[1] = p.autoSummary || !!p.summary.trim();
    d[2] = p.experience.length > 0;
    d[3] = p.education.length > 0;
    d[4] = splitList([p.skills.technical, p.skills.languages, p.skills.frameworks, p.skills.tools, p.skills.platforms, p.skills.domain, p.skills.soft, ...p.skills.other.map((o) => o.items)].join(",")).length > 0;
    d[5] = p.projects.length > 0;
    d[6] = p.certifications.length > 0 || !!p.achievements.trim();
    d[7] = ADDITIONAL_KINDS.some((k) => p.additional[k].trim());
    return d;
  }, [p]);

  return (
    <section className="step step-form" aria-labelledby="form-title">
      <JdSummary />
      <div className="form-layout">
        <nav className="form-nav" aria-label="Resume sections">
          <ol>
            {STEPS.map((label, i) => (
              <li key={label}>
                <button type="button" className={`form-nav-item${i === step ? " is-current" : ""}`} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
                  {done[i] ? <LuCheck className="nav-done" aria-hidden="true" /> : <LuCircle className="nav-todo" aria-hidden="true" />}
                  <span>{label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="form-main">
          <div className="form-progress" aria-hidden="true">
            <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="form-count">
            Step {step + 1} of {STEPS.length}
          </p>
          <h1 ref={titleRef} id="form-title" className="display step-title" tabIndex={-1}>
            {STEP_TITLES[step]}
          </h1>
          <p className="step-lede">{STEP_LEDES[step]}</p>

          {topError && (
            <div className="mb-16">
              <Notice kind="error">{topError}</Notice>
            </div>
          )}

          <div className="panel">
            {step === 0 && <PersonalStep p={p} update={update} errors={errors} />}
            {step === 1 && <SummaryStep p={p} update={update} jdText={state.jdText} />}
            {step === 2 && <ExperienceStep p={p} update={update} errors={errors} />}
            {step === 3 && <EducationStep p={p} update={update} errors={errors} />}
            {step === 4 && <SkillsStep p={p} update={update} jdTerms={state.jd?.keywords ?? []} />}
            {step === 5 && <ProjectsStep p={p} update={update} errors={errors} />}
            {step === 6 && <CertsStep p={p} update={update} errors={errors} />}
            {step === 7 && <AdditionalStep p={p} update={update} />}
          </div>

          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => (step === 0 ? go(state.method === "upload" && state.parse ? "review-upload" : "method") : setStep(step - 1))}>
              <LuArrowLeft aria-hidden="true" /> Back
            </button>
            <div className="actions-right">
              {step < STEPS.length - 1 && step > 0 && (
                <button className="btn btn-secondary" onClick={build}>
                  Build now
                </button>
              )}
              <button className="btn btn-primary btn-lg" onClick={next}>
                {step < STEPS.length - 1 ? "Next →" : "Build my resume"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEP_TITLES = [
  "Your contact details",
  "Professional summary",
  "Work experience",
  "Education",
  "Skills",
  "Projects",
  "Certifications and achievements",
  "Additional sections",
];
const STEP_LEDES = [
  "Only your name and email are required. Add links that help a recruiter learn more about you.",
  "A short introduction at the top of your resume. We can write it from your experience and the job.",
  "Start with your current or most recent role. Write plainly: we'll sharpen the wording without adding anything you didn't say.",
  "Add degrees, diplomas or other formal qualifications. Most recent first.",
  "List skills you actually have. We'll put the ones the job asks for first.",
  "Personal, academic or open-source projects that show relevant skills. Optional.",
  "Certifications, awards, publications, competitions, leadership. Optional.",
  "Only add sections that help your application. Empty sections are left out.",
];

/* -------------------------------- Personal ------------------------------- */

function PersonalStep({ p, update, errors }: { p: ProfileInput; update: Patch; errors: FieldErrors }) {
  const c = p.contact;
  const set = (k: keyof ProfileInput["contact"]) => (v: string) => update((x) => ({ ...x, contact: { ...x.contact, [k]: v } }));
  return (
    <div className="grid-2">
      <TextField label="Full name" value={c.fullName} onChange={set("fullName")} error={errors["contact.fullName"]} autoComplete="name" maxLength={80} />
      <TextField label="Professional title / desired role" optional value={c.title} onChange={set("title")} placeholder="e.g. Data Analyst" hint="Use a title that honestly describes you." maxLength={120} />
      <TextField label="Email" type="email" value={c.email} onChange={set("email")} error={errors["contact.email"]} autoComplete="email" inputMode="email" />
      <TextField label="Phone number" optional type="tel" value={c.phone} onChange={set("phone")} error={errors["contact.phone"]} autoComplete="tel" placeholder="+91 98765 43210" />
      <TextField label="City / location" optional value={c.location} onChange={set("location")} placeholder="e.g. Bengaluru, India" autoComplete="address-level2" />
      <TextField label="LinkedIn URL" optional value={c.linkedin} onChange={set("linkedin")} error={errors["contact.linkedin"]} placeholder="linkedin.com/in/yourname" inputMode="url" />
      <TextField label="Portfolio URL" optional value={c.portfolio} onChange={set("portfolio")} error={errors["contact.portfolio"]} placeholder="yourname.com" inputMode="url" />
      <TextField label="GitHub URL" optional value={c.github} onChange={set("github")} error={errors["contact.github"]} placeholder="github.com/yourname" inputMode="url" />
      <TextField
        label="Other professional link"
        optional
        className="span-2"
        value={c.otherLinks[0] ?? ""}
        onChange={(v) => update((x) => ({ ...x, contact: { ...x.contact, otherLinks: v ? [v, ...x.contact.otherLinks.slice(1)] : x.contact.otherLinks.slice(1) } }))}
        error={errors["contact.otherLinks.0"]}
        placeholder="e.g. behance.net/yourname or a publication page"
        inputMode="url"
      />
    </div>
  );
}

/* -------------------------------- Summary -------------------------------- */

function SummaryStep({ p, update, jdText }: { p: ProfileInput; update: Patch; jdText: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const draft = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await api.summary(p, jdText);
      update((x) => ({ ...x, summary: r.summary, autoSummary: false }));
      setMsg({ kind: "info", text: r.notice ?? "Here's a draft based on your details. Edit it as you like." });
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const hasContent = p.experience.length > 0 || p.education.length > 0 || p.projects.length > 0;
  return (
    <div className="stack-16">
      <fieldset className="choice-group">
        <legend className="sr-only">Summary option</legend>
        <label className={`choice${p.autoSummary ? " is-on" : ""}`}>
          <input type="radio" name="summary-mode" checked={p.autoSummary} onChange={() => update((x) => ({ ...x, autoSummary: true }))} />
          <span>
            <strong>Generate my professional summary automatically</strong>
            <span className="choice-desc">Written when your resume is built, from your experience, skills and achievements, aimed at this job.</span>
          </span>
        </label>
        <label className={`choice${!p.autoSummary ? " is-on" : ""}`}>
          <input type="radio" name="summary-mode" checked={!p.autoSummary} onChange={() => update((x) => ({ ...x, autoSummary: false }))} />
          <span>
            <strong>Use my own summary</strong>
            <span className="choice-desc">Write or paste your own. We'll keep your wording.</span>
          </span>
        </label>
      </fieldset>
      {!p.autoSummary && (
        <TextAreaField
          label="Your summary"
          value={p.summary}
          onChange={(v) => update((x) => ({ ...x, summary: v }))}
          rows={5}
          maxLength={1500}
          counter={`${p.summary.trim() ? p.summary.trim().split(/\s+/).length : 0} words`}
          placeholder="e.g. Data analyst with 4 years of experience turning sales and marketing data into decisions…"
          hint="Aim for 40–80 words. Skip “I” and “my”."
        />
      )}
      <div className="inline-actions">
        <button type="button" className="btn btn-secondary" onClick={draft} disabled={busy || !hasContent} title={hasContent ? undefined : "Add experience, education or projects first"}>
          {busy ? <Spinner label="Writing…" /> : (
            <>
              <LuWandSparkles aria-hidden="true" /> Draft a summary now
            </>
          )}
        </button>
        {!hasContent && <span className="field-hint">Add your experience or education first, then come back to draft a summary.</span>}
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </div>
  );
}

/* ------------------------------ List helpers ------------------------------ */

function ItemCard({ title, onRemove, children, index }: { title: string; onRemove: () => void; children: ReactNode; index: number }) {
  return (
    <div className="item-card">
      <div className="item-card-head">
        <h3>{title || `Entry ${index + 1}`}</h3>
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onRemove} aria-label={`Remove ${title || `entry ${index + 1}`}`}>
          <LuTrash2 aria-hidden="true" /> Remove
        </button>
      </div>
      {children}
    </div>
  );
}

function updateAt<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((x, j) => (j === i ? { ...x, ...patch } : x));
}

/* ------------------------------- Experience ------------------------------ */

function ExperienceStep({ p, update, errors }: { p: ProfileInput; update: Patch; errors: FieldErrors }) {
  const list = p.experience;
  const set = (i: number, patch: Partial<ExperienceInput>) => update((x) => ({ ...x, experience: updateAt(x.experience, i, patch) }));
  const add = () => update((x) => ({ ...x, experience: [...x.experience, emptyExperience()] }));
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current && list.length === 0) add();
    firstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="stack-20">
      {list.map((e, i) => (
        <ItemCard key={e.id} index={i} title={[e.title, e.company].filter(Boolean).join(" at ")} onRemove={() => update((x) => ({ ...x, experience: x.experience.filter((_, j) => j !== i) }))}>
          <div className="grid-2">
            <TextField label="Job title" value={e.title} onChange={(v) => set(i, { title: v })} error={errors[`experience.${i}.title`]} placeholder="e.g. Marketing Associate" />
            <TextField label="Company" value={e.company} onChange={(v) => set(i, { company: v })} error={errors[`experience.${i}.company`]} />
            <TextField label="Location" optional value={e.location} onChange={(v) => set(i, { location: v })} placeholder="City, or Remote" />
            <div />
            <MonthYearField label="Start date" value={e.startDate} onChange={(v) => set(i, { startDate: v })} error={errors[`experience.${i}.startDate`]} />
            <div className="stack-8">
              <MonthYearField label="End date" value={e.current ? "" : e.endDate} disabled={e.current} onChange={(v) => set(i, { endDate: v })} error={errors[`experience.${i}.endDate`]} />
              <label className="check">
                <input type="checkbox" checked={e.current} onChange={(ev) => set(i, { current: ev.target.checked, endDate: ev.target.checked ? "" : e.endDate })} />I currently work here
              </label>
            </div>
            <TextAreaField
              className="span-2"
              label="Responsibilities"
              value={e.responsibilities}
              onChange={(v) => set(i, { responsibilities: v })}
              error={errors[`experience.${i}.responsibilities`]}
              rows={4}
              placeholder={"One per line, e.g.\nManaged the weekly sales report for 3 regions\nHandled onboarding for new clients"}
              hint="One item per line."
            />
            <TextAreaField
              className="span-2"
              label="Achievements"
              optional
              value={e.achievements}
              onChange={(v) => set(i, { achievements: v })}
              rows={3}
              placeholder={"One per line, e.g.\nWon the regional sales award in 2023"}
            />
            <TextAreaField
              className="span-2"
              label="Quantifiable results"
              optional
              value={e.results}
              onChange={(v) => set(i, { results: v })}
              rows={3}
              placeholder={"Numbers you know, one per line, e.g.\nCut report preparation time from 2 days to 3 hours"}
              hint="Only numbers you can stand behind. We never make up metrics."
            />
            <TextField className="span-2" label="Technologies / tools used" optional value={e.technologies} onChange={(v) => set(i, { technologies: v })} placeholder="e.g. Excel, Salesforce, SQL" hint="Separate with commas." />
          </div>
        </ItemCard>
      ))}
      <button type="button" className="btn btn-secondary add-btn" onClick={add}>
        <LuPlus aria-hidden="true" /> Add Another Experience
      </button>
      {list.length === 0 && <p className="field-hint">No work experience yet? That's fine. Skip ahead and add education and projects.</p>}
    </div>
  );
}

/* ------------------------------- Education ------------------------------- */

function EducationStep({ p, update, errors }: { p: ProfileInput; update: Patch; errors: FieldErrors }) {
  const set = (i: number, patch: Partial<EducationInput>) => update((x) => ({ ...x, education: updateAt(x.education, i, patch) }));
  const add = () => update((x) => ({ ...x, education: [...x.education, emptyEducation()] }));
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current && p.education.length === 0) add();
    firstRender.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="stack-20">
      {p.education.map((e, i) => (
        <ItemCard key={e.id} index={i} title={e.degree || e.institution} onRemove={() => update((x) => ({ ...x, education: x.education.filter((_, j) => j !== i) }))}>
          <div className="grid-2">
            <TextField label="Degree / qualification" value={e.degree} onChange={(v) => set(i, { degree: v })} error={errors[`education.${i}.degree`]} placeholder="e.g. B.Tech in Computer Science" />
            <TextField label="Institution" value={e.institution} onChange={(v) => set(i, { institution: v })} error={errors[`education.${i}.institution`]} />
            <TextField label="Location" optional value={e.location} onChange={(v) => set(i, { location: v })} />
            <TextField label="CGPA / percentage" optional value={e.grade} onChange={(v) => set(i, { grade: v })} placeholder="e.g. CGPA 8.4/10 or 82%" />
            <TextField label="Start year" optional value={e.startYear} onChange={(v) => set(i, { startYear: v.replace(/[^\d]/g, "").slice(0, 4) })} inputMode="numeric" placeholder="2019" />
            <TextField label="End year (or expected)" optional value={e.endYear} onChange={(v) => set(i, { endYear: v.slice(0, 16) })} error={errors[`education.${i}.endYear`]} placeholder="2023" />
            <TextField className="span-2" label="Relevant coursework" optional value={e.coursework} onChange={(v) => set(i, { coursework: v })} placeholder="e.g. Data Structures, Statistics, Marketing Analytics" />
          </div>
        </ItemCard>
      ))}
      <button type="button" className="btn btn-secondary add-btn" onClick={add}>
        <LuPlus aria-hidden="true" /> Add education
      </button>
    </div>
  );
}

/* --------------------------------- Skills -------------------------------- */

const SKILL_FIELDS: [keyof Omit<ProfileInput["skills"], "other">, string, string][] = [
  ["technical", "Technical skills", "e.g. Data analysis, Financial modeling, SEO"],
  ["languages", "Programming languages", "e.g. Python, SQL, JavaScript"],
  ["frameworks", "Frameworks & libraries", "e.g. React, Django, Pandas"],
  ["tools", "Tools", "e.g. Excel, Jira, Figma, Salesforce"],
  ["platforms", "Platforms & cloud", "e.g. AWS, Shopify, SAP"],
  ["domain", "Domain skills", "e.g. Payments, Supply chain, Healthcare compliance"],
  ["soft", "Soft skills", "e.g. Stakeholder management, Mentoring"],
];

function SkillsStep({ p, update, jdTerms }: { p: ProfileInput; update: Patch; jdTerms: { term: string; canonical: string; kind: string; importance: string }[] }) {
  const set = (k: keyof Omit<ProfileInput["skills"], "other">) => (v: string) => update((x) => ({ ...x, skills: { ...x.skills, [k]: v } }));
  const corpus = profileCorpus(p);
  const suggestions = jdTerms.filter((k) => (k.kind === "skill" || k.kind === "tool") && !textHasTerm(corpus, k.canonical)).slice(0, 14);
  const addSkill = (term: string) => update((x) => ({ ...x, skills: { ...x.skills, technical: x.skills.technical.trim() ? `${x.skills.technical.trim().replace(/,$/, "")}, ${term}` : term } }));
  return (
    <div className="stack-20">
      {suggestions.length > 0 && (
        <div className="suggest-box">
          <p className="suggest-title">Skills this job asks for that aren't in your details yet</p>
          <p className="field-hint">Add one only if you genuinely have it. We never add skills on your behalf.</p>
          <div className="chip-row">
            {suggestions.map((s) => (
              <button type="button" key={s.canonical} className="chip chip-btn" onClick={() => addSkill(s.term)}>
                <LuPlus aria-hidden="true" /> {s.term}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid-2">
        {SKILL_FIELDS.map(([k, label, ph]) => (
          <TextField key={k} label={label} optional value={p.skills[k]} onChange={set(k)} placeholder={ph} hint={k === "technical" ? "Separate skills with commas." : undefined} />
        ))}
      </div>
      {p.skills.other.length > 0 && (
        <div className="stack-12">
          <h3 className="sub-title">Other skill groups from your resume</h3>
          {p.skills.other.map((o, i) => (
            <div className="grid-2 other-skill" key={o.id}>
              <TextField label="Group name" value={o.category} onChange={(v) => update((x) => ({ ...x, skills: { ...x.skills, other: updateAt(x.skills.other, i, { category: v }) } }))} />
              <div className="row-end">
                <TextField className="grow" label="Skills" value={o.items} onChange={(v) => update((x) => ({ ...x, skills: { ...x.skills, other: updateAt(x.skills.other, i, { items: v }) } }))} />
                <button type="button" className="btn btn-danger-ghost btn-sm" aria-label={`Remove ${o.category}`} onClick={() => update((x) => ({ ...x, skills: { ...x.skills, other: x.skills.other.filter((_, j) => j !== i) } }))}>
                  <LuTrash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btn-ghost add-btn" onClick={() => update((x) => ({ ...x, skills: { ...x.skills, other: [...x.skills.other, { id: uid("sk"), category: "", items: "" }] } }))}>
        <LuPlus aria-hidden="true" /> Add a custom skill group
      </button>
    </div>
  );
}

/* -------------------------------- Projects ------------------------------- */

function ProjectsStep({ p, update, errors }: { p: ProfileInput; update: Patch; errors: FieldErrors }) {
  const set = (i: number, patch: Partial<ProjectInput>) => update((x) => ({ ...x, projects: updateAt(x.projects, i, patch) }));
  return (
    <div className="stack-20">
      {p.projects.map((x, i) => (
        <ItemCard key={x.id} index={i} title={x.name} onRemove={() => update((y) => ({ ...y, projects: y.projects.filter((_, j) => j !== i) }))}>
          <div className="grid-2">
            <TextField label="Project name" value={x.name} onChange={(v) => set(i, { name: v })} error={errors[`projects.${i}.name`]} />
            <TextField label="Link" optional value={x.link} onChange={(v) => set(i, { link: v })} error={errors[`projects.${i}.link`]} placeholder="github.com/you/project" inputMode="url" />
            <TextAreaField className="span-2" label="Description" optional value={x.description} onChange={(v) => set(i, { description: v })} rows={2} placeholder="What it is and who it's for, in a sentence." />
            <TextField className="span-2" label="Technologies" optional value={x.technologies} onChange={(v) => set(i, { technologies: v })} placeholder="Separate with commas" />
            <TextAreaField className="span-2" label="What you did" optional value={x.responsibilities} onChange={(v) => set(i, { responsibilities: v })} rows={3} hint="One item per line." />
            <TextAreaField className="span-2" label="Outcomes" optional value={x.outcomes} onChange={(v) => set(i, { outcomes: v })} rows={2} placeholder="e.g. Used by 200 students in my college" />
          </div>
        </ItemCard>
      ))}
      <button type="button" className="btn btn-secondary add-btn" onClick={() => update((x) => ({ ...x, projects: [...x.projects, emptyProject()] }))}>
        <LuPlus aria-hidden="true" /> Add a project
      </button>
    </div>
  );
}

/* ----------------------------- Certifications ---------------------------- */

function CertsStep({ p, update, errors }: { p: ProfileInput; update: Patch; errors: FieldErrors }) {
  const set = (i: number, patch: Partial<CertificationInput>) => update((x) => ({ ...x, certifications: updateAt(x.certifications, i, patch) }));
  return (
    <div className="stack-20">
      <h3 className="sub-title">Certifications</h3>
      {p.certifications.map((c, i) => (
        <ItemCard key={c.id} index={i} title={c.name} onRemove={() => update((x) => ({ ...x, certifications: x.certifications.filter((_, j) => j !== i) }))}>
          <div className="grid-2">
            <TextField label="Certification name" value={c.name} onChange={(v) => set(i, { name: v })} error={errors[`certifications.${i}.name`]} placeholder="e.g. Google Data Analytics Certificate" />
            <TextField label="Issuing organization" optional value={c.issuer} onChange={(v) => set(i, { issuer: v })} />
            <MonthYearField label="Date" optional value={c.date} onChange={(v) => set(i, { date: v })} />
            <TextField label="Credential ID" optional value={c.credentialId} onChange={(v) => set(i, { credentialId: v })} />
            <TextField className="span-2" label="Credential URL" optional value={c.url} onChange={(v) => set(i, { url: v })} error={errors[`certifications.${i}.url`]} inputMode="url" />
          </div>
        </ItemCard>
      ))}
      <button type="button" className="btn btn-secondary add-btn" onClick={() => update((x) => ({ ...x, certifications: [...x.certifications, emptyCertification()] }))}>
        <LuPlus aria-hidden="true" /> Add a certification
      </button>
      <TextAreaField
        label="Achievements"
        optional
        value={p.achievements}
        onChange={(v) => update((x) => ({ ...x, achievements: v }))}
        rows={4}
        placeholder={"Awards, publications, competitions, leadership roles. One per line, e.g.\nFirst place, State-level hackathon 2023\nPresident, College Entrepreneurship Club"}
      />
    </div>
  );
}

/* ------------------------------- Additional ------------------------------ */

const ADDITIONAL_HINTS: Record<AdditionalKind, string> = {
  Languages: "e.g. English (Fluent), Hindi (Native)",
  "Volunteer Experience": "e.g. Taught weekend coding classes at a local NGO",
  Publications: "Title, publication, year",
  Conferences: "Talks you gave or events you presented at",
  "Professional Memberships": "e.g. Member, Project Management Institute",
  Interests: "Only if relevant to the role, e.g. Chess, Open-source",
};

function AdditionalStep({ p, update }: { p: ProfileInput; update: Patch }) {
  return (
    <div className="grid-2">
      {ADDITIONAL_KINDS.map((k) => (
        <TextAreaField
          key={k}
          label={k}
          optional
          value={p.additional[k]}
          onChange={(v) => update((x) => ({ ...x, additional: { ...x.additional, [k]: v } }))}
          rows={3}
          placeholder={ADDITIONAL_HINTS[k]}
          hint="One per line."
        />
      ))}
    </div>
  );
}
