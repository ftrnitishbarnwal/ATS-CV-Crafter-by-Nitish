import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { LuFileUp, LuPenLine, LuFileText, LuX, LuCircleCheck, LuTriangleAlert, LuArrowLeft } from "react-icons/lu";
import { useBuilder } from "../lib/store";
import { api } from "../lib/api";
import { LIMITS } from "../../shared/validation";
import { emptyProfile } from "../../shared/util";
import { Notice, Spinner, TextField } from "./ui";
import { ScoreRing } from "./ScorePanel";
import type { ProfileInput } from "../../shared/types";
import { splitList, splitLines } from "../../shared/util";

export function JdSummary() {
  const { state, go } = useBuilder();
  const jd = state.jd;
  if (!jd) return null;
  const top = jd.keywords.filter((k) => k.kind !== "domain" && k.importance === "required").slice(0, 8);
  return (
    <div className="jd-summary">
      <div>
        <span className="jd-summary-label">Targeting</span>
        <strong>{jd.title || "Role from your job description"}</strong>
        <span className="jd-summary-meta">
          {jd.keywords.length} keywords found{jd.minYears ? `, ${jd.minYears}+ years requested` : ""}
        </span>
      </div>
      {top.length > 0 && (
        <ul className="chip-row" aria-label="Top required keywords">
          {top.map((k) => (
            <li key={k.canonical} className="chip">
              {k.term}
            </li>
          ))}
        </ul>
      )}
      <button className="btn btn-ghost btn-sm" onClick={() => go("jd")}>
        Edit job description
      </button>
    </div>
  );
}

export function StepMethod() {
  const { state, go } = useBuilder();
  const hasDraft = state.profile.contact.fullName || state.profile.experience.length > 0;
  return (
    <section className="step" aria-labelledby="method-title">
      <JdSummary />
      <h1 id="method-title" className="display step-title" tabIndex={-1}>
        How would you like to start?
      </h1>
      <p className="step-lede">Choose one. Either way, you can review and edit everything before downloading.</p>
      <div className="method-grid">
        <button className="method-card" onClick={() => go("upload", { method: "upload", returnStep: "review-upload" })}>
          <LuFileUp aria-hidden="true" />
          <span className="method-title">Upload Your Existing Resume</span>
          <span className="method-desc">Upload your current resume and we'll analyze, optimize and tailor it for your target role.</span>
          <span className="method-meta">PDF, DOCX or TXT, up to 5 MB</span>
        </button>
        <button
          className="method-card"
          onClick={() =>
            go("form", {
              method: "form",
              returnStep: "form",
              formStep: 0,
              profile: state.method === "form" && hasDraft ? state.profile : emptyProfile(),
            })
          }
        >
          <LuPenLine aria-hidden="true" />
          <span className="method-title">Create Resume From Details</span>
          <span className="method-desc">Don't have a resume? Build one from scratch using your professional details.</span>
          <span className="method-meta">Guided form, about 10 minutes</span>
        </button>
      </div>
      <div className="step-actions">
        <button className="btn btn-ghost" onClick={() => go("jd")}>
          <LuArrowLeft aria-hidden="true" /> Back
        </button>
      </div>
    </section>
  );
}

const ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

function clientCheck(file: File): string | null {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "doc") return "Older .doc files aren't supported. Save it as .docx or PDF and upload again.";
  if (!["pdf", "docx", "txt"].includes(ext)) return "This file type isn't supported. Upload a PDF, DOCX or TXT file.";
  if (file.size === 0) return "This file is empty. Choose a different file.";
  if (file.size > LIMITS.fileMaxBytes) return `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB. Try exporting a smaller PDF or upload a DOCX.`;
  return null;
}

export function StepUpload() {
  const { state, go } = useBuilder();
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "reading" | "analyzing">("idle");
  const [fileName, setFileName] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const handle = async (file: File | undefined) => {
    if (!file || phase !== "idle") return;
    setError(null);
    const err = clientCheck(file);
    if (err) {
      setError(err);
      return;
    }
    setFileName(file.name);
    setPhase("reading");
    try {
      const parse = await api.parseResume(file);
      setPhase("analyzing");
      const analysis = await api.analyze(parse.profile, state.jdText);
      go("review-upload", { parse, profile: parse.profile, uploadAnalysis: analysis, fileName: file.name, method: "upload", returnStep: "review-upload" });
    } catch (e) {
      setError((e as Error).message);
      setPhase("idle");
      if (input.current) input.current.value = "";
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    handle(e.dataTransfer.files?.[0]);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.current?.click();
    }
  };

  return (
    <section className="step step-narrow" aria-labelledby="upload-title">
      <JdSummary />
      <h1 id="upload-title" className="display step-title" tabIndex={-1}>
        Upload your resume
      </h1>
      <p className="step-lede">We'll read it, find your experience, education and skills, and compare it with the job.</p>

      <div
        className={`dropzone${drag ? " is-drag" : ""}${phase !== "idle" ? " is-busy" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Upload resume file. Drag and drop, or press Enter to choose a file."
        aria-busy={phase !== "idle"}
        onClick={() => phase === "idle" && input.current?.click()}
        onKeyDown={onKey}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {phase === "idle" ? (
          <>
            <LuFileText aria-hidden="true" className="dz-icon" />
            <p className="dz-title">Drag and drop your resume here</p>
            <p className="dz-sub">
              or <span className="dz-link">choose a file</span> from your device
            </p>
            <p className="dz-meta">PDF, DOCX or TXT, up to 5 MB</p>
          </>
        ) : (
          <>
            <Spinner />
            <p className="dz-title">{phase === "reading" ? "Reading your resume…" : "Comparing it with the job…"}</p>
            <p className="dz-sub">{fileName}</p>
          </>
        )}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => handle(e.target.files?.[0])} />
      </div>

      {error && (
        <div className="mt-16">
          <Notice kind="error" title="We couldn't use that file">
            <p>{error}</p>
          </Notice>
        </div>
      )}

      <div className="step-actions">
        <button className="btn btn-ghost" onClick={() => go("method")} disabled={phase !== "idle"}>
          <LuArrowLeft aria-hidden="true" /> Back
        </button>
        <button className="btn btn-secondary" onClick={() => go("form", { method: "form", returnStep: "form", formStep: 0, profile: emptyProfile() })} disabled={phase !== "idle"}>
          Build from details instead
        </button>
      </div>
    </section>
  );
}

function countSkills(p: ProfileInput): number {
  const s = p.skills;
  return splitList([s.technical, s.languages, s.frameworks, s.tools, s.platforms, s.domain, s.soft, ...s.other.map((o) => o.items)].join(",")).length;
}

export function ReviewUpload() {
  const { state, patch, go } = useBuilder();
  const { parse, uploadAnalysis } = state;
  const p = state.profile;
  const [missing] = useState(() => ({
    fullName: !p.contact.fullName,
    email: !p.contact.email,
    phone: !p.contact.phone,
    linkedin: !p.contact.linkedin,
  }));
  if (!parse || !uploadAnalysis) {
    return (
      <section className="step step-narrow">
        <Notice kind="info">Your upload session expired. Please upload your resume again.</Notice>
        <div className="step-actions">
          <button className="btn btn-primary" onClick={() => go("upload")}>
            Upload again
          </button>
        </div>
      </section>
    );
  }
  const r = uploadAnalysis.report;
  const setContact = (k: keyof ProfileInput["contact"], v: string) => patch((s) => ({ profile: { ...s.profile, contact: { ...s.profile.contact, [k]: v } } }));
  const bulletCount = p.experience.reduce((n, e) => n + splitLines(e.responsibilities).length, 0);
  const found = [
    { label: "Contact details", ok: !!(p.contact.fullName && p.contact.email), detail: [p.contact.fullName, p.contact.email].filter(Boolean).join(", ") || "Not found" },
    { label: "Experience", ok: p.experience.length > 0, detail: p.experience.length ? `${p.experience.length} role${p.experience.length > 1 ? "s" : ""}, ${bulletCount} bullet points` : "Not found" },
    { label: "Education", ok: p.education.length > 0, detail: p.education.length ? `${p.education.length} entr${p.education.length > 1 ? "ies" : "y"}` : "Not found" },
    { label: "Skills", ok: countSkills(p) > 0, detail: countSkills(p) ? `${countSkills(p)} skills` : "Not found" },
    { label: "Projects", ok: p.projects.length > 0, detail: p.projects.length ? `${p.projects.length}` : "None", optional: true },
    { label: "Certifications", ok: p.certifications.length > 0, detail: p.certifications.length ? `${p.certifications.length}` : "None", optional: true },
    { label: "Summary", ok: !!p.summary, detail: p.summary ? "Found" : "We'll write one from your experience", optional: true },
  ];
  const matched = r.keywordMatches.filter((m) => m.found).length;
  const emailBad = p.contact.email && !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(p.contact.email);
  const canBuild = !!p.contact.fullName.trim() && !!p.contact.email.trim() && !emailBad;

  return (
    <section className="step" aria-labelledby="review-title">
      <JdSummary />
      <h1 id="review-title" className="display step-title" tabIndex={-1}>
        Here's what we found in your resume
      </h1>
      <p className="step-lede">
        From <strong>{state.fileName}</strong>. Check the details below, then build your tailored version.
      </p>

      {parse.warnings.length > 0 && (
        <div className="mb-16">
          <Notice kind="warn" title="Please double-check">
            <ul className="plain-list">
              {parse.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="review-grid">
        <div className="panel">
          <h2 className="panel-title">Extracted from your file</h2>
          <ul className="found-list">
            {found.map((f) => (
              <li key={f.label}>
                {f.ok ? <LuCircleCheck className="ok" aria-label="Found" /> : f.optional ? <LuX className="na" aria-label="Not included" /> : <LuTriangleAlert className="warn" aria-label="Missing" />}
                <span className="found-label">{f.label}</span>
                <span className="found-detail">{f.detail}</span>
              </li>
            ))}
          </ul>

          {(missing.fullName || missing.email || missing.phone || missing.linkedin) && (
            <div className="quickfill">
              <h3>Add what we couldn't find</h3>
              <div className="grid-2">
                {missing.fullName && <TextField label="Full name" value={p.contact.fullName} onChange={(v) => setContact("fullName", v)} autoComplete="name" />}
                {missing.email && (
                  <TextField label="Email" type="email" value={p.contact.email} onChange={(v) => setContact("email", v)} autoComplete="email" error={emailBad ? "Enter a valid email, like name@example.com." : undefined} />
                )}
                {missing.phone && <TextField label="Phone" optional type="tel" value={p.contact.phone} onChange={(v) => setContact("phone", v)} autoComplete="tel" />}
                {missing.linkedin && <TextField label="LinkedIn URL" optional value={p.contact.linkedin} onChange={(v) => setContact("linkedin", v)} placeholder="linkedin.com/in/yourname" />}
              </div>
            </div>
          )}
        </div>

        <div className="panel baseline-panel">
          <h2 className="panel-title">Your resume as it is today</h2>
          <div className="baseline-row">
            <ScoreRing value={r.total} size={112} />
            <div>
              <p className="baseline-caption">Starting optimization score for this job</p>
              <p className="baseline-sub">
                {matched} of {r.keywordMatches.length} job keywords already appear.
              </p>
            </div>
          </div>
          {r.weakAreas.length > 0 && (
            <>
              <h3 className="sub-title">Biggest gaps</h3>
              <ul className="insight-list">
                {r.weakAreas.slice(0, 4).map((w, i) => (
                  <li key={i} className={`sev-${w.severity}`}>
                    <strong>{w.area}.</strong> {w.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="step-actions">
        <button className="btn btn-ghost" onClick={() => go("upload")}>
          <LuArrowLeft aria-hidden="true" /> Upload a different file
        </button>
        <div className="actions-right">
          <button className="btn btn-secondary" onClick={() => go("form", { formStep: 0, returnStep: "review-upload" })}>
            Review and edit details
          </button>
          <button className="btn btn-primary btn-lg" disabled={!canBuild} onClick={() => go("generating", { returnStep: "review-upload" })}>
            Build my tailored resume
          </button>
        </div>
      </div>
      {!canBuild && <p className="field-hint align-right">Add your name and a valid email to continue.</p>}
    </section>
  );
}
