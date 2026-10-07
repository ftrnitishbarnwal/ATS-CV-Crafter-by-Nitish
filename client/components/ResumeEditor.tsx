import { useState, type ReactNode } from "react";
import { LuPlus, LuTrash2, LuArrowUp, LuArrowDown } from "react-icons/lu";
import type { Resume, ResumeExperience, ResumeEducation, ResumeProject, ResumeCertification } from "../../shared/types";
import { ADDITIONAL_KINDS } from "../../shared/types";
import { uid } from "../../shared/util";
import { validateContact } from "../../shared/validation";
import { TextField, TextAreaField, MonthYearField } from "./ui";

/** Text editor for a list stored as string[] (one per line or comma separated). Keeps the raw text while typing. */
function ListText({ label, items, onChange, mode, rows = 4, hint, optional }: { label: string; items: string[]; onChange: (v: string[]) => void; mode: "lines" | "comma"; rows?: number; hint?: string; optional?: boolean }) {
  const [text, setText] = useState(() => items.join(mode === "lines" ? "\n" : ", "));
  const commit = (t: string) => {
    setText(t);
    const parts = (mode === "lines" ? t.split(/\n/) : t.split(/,/)).map((x) => x.replace(/^\s*[•\-*]\s*/, "").trim()).filter(Boolean);
    onChange(parts);
  };
  return mode === "lines" ? (
    <TextAreaField label={label} value={text} onChange={commit} rows={rows} hint={hint ?? "One per line."} optional={optional} />
  ) : (
    <TextField label={label} value={text} onChange={commit} hint={hint ?? "Separate with commas."} optional={optional} />
  );
}

function Block({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="edit-block">
      <div className="edit-block-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function EntryHead({ title, onUp, onDown, onRemove }: { title: string; onUp?: () => void; onDown?: () => void; onRemove: () => void }) {
  return (
    <div className="item-card-head">
      <h4>{title}</h4>
      <div className="entry-tools">
        {onUp && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onUp} aria-label={`Move ${title} up`}>
            <LuArrowUp aria-hidden="true" />
          </button>
        )}
        {onDown && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDown} aria-label={`Move ${title} down`}>
            <LuArrowDown aria-hidden="true" />
          </button>
        )}
        <button type="button" className="btn btn-danger-ghost btn-sm" onClick={onRemove} aria-label={`Remove ${title}`}>
          <LuTrash2 aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function move<T>(list: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function ResumeEditor({ resume, onChange }: { resume: Resume; onChange: (r: Resume) => void }) {
  const r = resume;
  const set = (patch: Partial<Resume>) => onChange({ ...r, ...patch });
  const setContact = (k: keyof Resume["contact"]) => (v: string) => set({ contact: { ...r.contact, [k]: v } });
  const errors = validateContact(r);
  const setExp = (i: number, p: Partial<ResumeExperience>) => set({ experience: r.experience.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setEdu = (i: number, p: Partial<ResumeEducation>) => set({ education: r.education.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setPrj = (i: number, p: Partial<ResumeProject>) => set({ projects: r.projects.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const setCert = (i: number, p: Partial<ResumeCertification>) => set({ certifications: r.certifications.map((e, j) => (j === i ? { ...e, ...p } : e)) });
  const ensureOrder = (key: Resume["sectionOrder"][number]) => (r.sectionOrder.includes(key) ? r.sectionOrder : [...r.sectionOrder, key]);

  return (
    <div className="editor">
      <Block title="Contact details">
        <div className="grid-2">
          <TextField label="Full name" value={r.contact.fullName} onChange={setContact("fullName")} error={errors["contact.fullName"]} />
          <TextField label="Headline" optional value={r.contact.title} onChange={setContact("title")} />
          <TextField label="Email" value={r.contact.email} onChange={setContact("email")} error={errors["contact.email"]} />
          <TextField label="Phone" optional value={r.contact.phone} onChange={setContact("phone")} error={errors["contact.phone"]} />
          <TextField label="Location" optional value={r.contact.location} onChange={setContact("location")} />
          <TextField label="LinkedIn" optional value={r.contact.linkedin} onChange={setContact("linkedin")} error={errors["contact.linkedin"]} />
          <TextField label="GitHub" optional value={r.contact.github} onChange={setContact("github")} error={errors["contact.github"]} />
          <TextField label="Portfolio" optional value={r.contact.portfolio} onChange={setContact("portfolio")} error={errors["contact.portfolio"]} />
        </div>
      </Block>

      <Block title="Summary">
        <TextAreaField label="Professional summary" value={r.summary} onChange={(v) => set({ summary: v })} rows={5} counter={`${r.summary.trim() ? r.summary.trim().split(/\s+/).length : 0} words`} />
      </Block>

      <Block
        title="Skills"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ skills: [...r.skills, { id: uid("sg"), category: "Skills", items: [] }], sectionOrder: ensureOrder("skills") })}>
            <LuPlus aria-hidden="true" /> Group
          </button>
        }
      >
        <div className="stack-12">
          {r.skills.map((g, i) => (
            <div key={g.id} className="skill-edit">
              <TextField label="Group" value={g.category} onChange={(v) => set({ skills: r.skills.map((x, j) => (j === i ? { ...x, category: v } : x)) })} />
              <div className="row-end">
                <div className="grow">
                  <ListText label="Skills" mode="comma" items={g.items} onChange={(items) => set({ skills: r.skills.map((x, j) => (j === i ? { ...x, items } : x)) })} />
                </div>
                <button type="button" className="btn btn-danger-ghost btn-sm" aria-label={`Remove ${g.category}`} onClick={() => set({ skills: r.skills.filter((_, j) => j !== i) })}>
                  <LuTrash2 aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Experience"
        action={
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => set({ experience: [...r.experience, { id: uid("exp"), company: "", title: "", location: "", startDate: "", endDate: "", current: false, bullets: [], technologies: [] }], sectionOrder: ensureOrder("experience") })}
          >
            <LuPlus aria-hidden="true" /> Role
          </button>
        }
      >
        <div className="stack-16">
          {r.experience.map((e, i) => (
            <div key={e.id} className="item-card">
              <EntryHead
                title={[e.title, e.company].filter(Boolean).join(" at ") || `Role ${i + 1}`}
                onUp={i > 0 ? () => set({ experience: move(r.experience, i, -1) }) : undefined}
                onDown={i < r.experience.length - 1 ? () => set({ experience: move(r.experience, i, 1) }) : undefined}
                onRemove={() => set({ experience: r.experience.filter((_, j) => j !== i) })}
              />
              <div className="grid-2">
                <TextField label="Job title" value={e.title} onChange={(v) => setExp(i, { title: v })} />
                <TextField label="Company" value={e.company} onChange={(v) => setExp(i, { company: v })} />
                <TextField label="Location" optional value={e.location} onChange={(v) => setExp(i, { location: v })} />
                <div />
                <MonthYearField label="Start date" value={e.startDate} onChange={(v) => setExp(i, { startDate: v })} />
                <div className="stack-8">
                  <MonthYearField label="End date" value={e.current ? "" : e.endDate} disabled={e.current} onChange={(v) => setExp(i, { endDate: v })} />
                  <label className="check">
                    <input type="checkbox" checked={e.current} onChange={(ev) => setExp(i, { current: ev.target.checked, endDate: ev.target.checked ? "" : e.endDate })} />
                    Current role
                  </label>
                </div>
                <div className="span-2">
                  <ListText label="Bullet points" mode="lines" rows={Math.max(4, e.bullets.length + 1)} items={e.bullets} onChange={(bullets) => setExp(i, { bullets })} />
                </div>
                <div className="span-2">
                  <ListText label="Technologies" optional mode="comma" items={e.technologies} onChange={(technologies) => setExp(i, { technologies })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Projects"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ projects: [...r.projects, { id: uid("prj"), name: "", link: "", technologies: [], bullets: [] }], sectionOrder: ensureOrder("projects") })}>
            <LuPlus aria-hidden="true" /> Project
          </button>
        }
      >
        <div className="stack-16">
          {r.projects.map((p, i) => (
            <div key={p.id} className="item-card">
              <EntryHead
                title={p.name || `Project ${i + 1}`}
                onUp={i > 0 ? () => set({ projects: move(r.projects, i, -1) }) : undefined}
                onDown={i < r.projects.length - 1 ? () => set({ projects: move(r.projects, i, 1) }) : undefined}
                onRemove={() => set({ projects: r.projects.filter((_, j) => j !== i) })}
              />
              <div className="grid-2">
                <TextField label="Name" value={p.name} onChange={(v) => setPrj(i, { name: v })} />
                <TextField label="Link" optional value={p.link} onChange={(v) => setPrj(i, { link: v })} />
                <div className="span-2">
                  <ListText label="Bullet points" mode="lines" rows={Math.max(3, p.bullets.length + 1)} items={p.bullets} onChange={(bullets) => setPrj(i, { bullets })} />
                </div>
                <div className="span-2">
                  <ListText label="Technologies" optional mode="comma" items={p.technologies} onChange={(technologies) => setPrj(i, { technologies })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Education"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ education: [...r.education, { id: uid("edu"), degree: "", institution: "", location: "", startYear: "", endYear: "", grade: "", coursework: "" }], sectionOrder: ensureOrder("education") })}>
            <LuPlus aria-hidden="true" /> Education
          </button>
        }
      >
        <div className="stack-16">
          {r.education.map((e, i) => (
            <div key={e.id} className="item-card">
              <EntryHead title={e.degree || e.institution || `Education ${i + 1}`} onRemove={() => set({ education: r.education.filter((_, j) => j !== i) })} />
              <div className="grid-2">
                <TextField label="Degree" value={e.degree} onChange={(v) => setEdu(i, { degree: v })} />
                <TextField label="Institution" value={e.institution} onChange={(v) => setEdu(i, { institution: v })} />
                <TextField label="Location" optional value={e.location} onChange={(v) => setEdu(i, { location: v })} />
                <TextField label="CGPA / percentage" optional value={e.grade} onChange={(v) => setEdu(i, { grade: v })} />
                <TextField label="Start year" optional value={e.startYear} onChange={(v) => setEdu(i, { startYear: v })} />
                <TextField label="End year" optional value={e.endYear} onChange={(v) => setEdu(i, { endYear: v })} />
                <TextField className="span-2" label="Relevant coursework" optional value={e.coursework} onChange={(v) => setEdu(i, { coursework: v })} />
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block
        title="Certifications"
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => set({ certifications: [...r.certifications, { id: uid("cert"), name: "", issuer: "", date: "", credentialId: "", url: "" }], sectionOrder: ensureOrder("certifications") })}>
            <LuPlus aria-hidden="true" /> Certification
          </button>
        }
      >
        <div className="stack-16">
          {r.certifications.map((c, i) => (
            <div key={c.id} className="item-card">
              <EntryHead title={c.name || `Certification ${i + 1}`} onRemove={() => set({ certifications: r.certifications.filter((_, j) => j !== i) })} />
              <div className="grid-2">
                <TextField label="Name" value={c.name} onChange={(v) => setCert(i, { name: v })} />
                <TextField label="Issuer" optional value={c.issuer} onChange={(v) => setCert(i, { issuer: v })} />
                <MonthYearField label="Date" optional value={c.date} onChange={(v) => setCert(i, { date: v })} />
                <TextField label="Credential ID" optional value={c.credentialId} onChange={(v) => setCert(i, { credentialId: v })} />
                <TextField className="span-2" label="URL" optional value={c.url} onChange={(v) => setCert(i, { url: v })} />
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Achievements">
        <ListText label="Achievements" optional mode="lines" items={r.achievements} onChange={(achievements) => set({ achievements, sectionOrder: ensureOrder("achievements") })} />
      </Block>

      <Block title="Additional sections">
        <div className="grid-2">
          {ADDITIONAL_KINDS.map((kind) => {
            const sec = r.additional.find((s) => s.title === kind);
            return (
              <ListText
                key={kind}
                label={kind}
                optional
                mode="lines"
                rows={3}
                items={sec?.items ?? []}
                onChange={(items) => {
                  const others = r.additional.filter((s) => s.title !== kind);
                  const next = items.length ? [...others, { id: kind, title: kind, items }] : others;
                  set({ additional: ADDITIONAL_KINDS.flatMap((k) => next.filter((s) => s.title === k)), sectionOrder: ensureOrder("additional") });
                }}
              />
            );
          })}
        </div>
      </Block>
    </div>
  );
}
