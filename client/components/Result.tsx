import { useState } from "react";
import { LuDownload, LuEye, LuPencil, LuRotateCcw, LuFileText, LuInfo, LuArrowLeft } from "react-icons/lu";
import { useBuilder } from "../lib/store";
import { api, downloadBlob } from "../lib/api";
import type { PageSize, Resume } from "../../shared/types";
import { validateContact } from "../../shared/validation";
import { ScorePanel } from "./ScorePanel";
import { ResumeEditor } from "./ResumeEditor";
import { PdfPreview } from "./PdfPreview";
import { Notice, Spinner } from "./ui";

export function Result() {
  const { state, patch, go, reset } = useBuilder();
  const [tab, setTab] = useState<"preview" | "edit">("preview");
  const [busy, setBusy] = useState<"" | "pdf" | "docx" | "score">("");
  const [message, setMessage] = useState<{ kind: "error" | "success" | "warn"; text: string } | null>(null);
  const { resume, report, result } = state;
  if (!resume || !report || !result) {
    return (
      <section className="step step-narrow">
        <Notice kind="info">There's no resume to show yet.</Notice>
        <div className="step-actions">
          <button className="btn btn-primary" onClick={() => go("jd")}>
            Start
          </button>
        </div>
      </section>
    );
  }

  const onEdit = (r: Resume) => patch({ resume: r, scoreStale: true });

  const recalc = async () => {
    setBusy("score");
    setMessage(null);
    try {
      const { report: next, pageCount } = await api.score(resume, state.jdText, state.pageSize);
      patch({ report: next, pageCount, scoreStale: false });
      setMessage({ kind: "success", text: `Score updated: ${next.total}/100.` });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  };

  const download = async (kind: "pdf" | "docx") => {
    const errs = validateContact(resume);
    if (errs["contact.fullName"] || errs["contact.email"]) {
      setTab("edit");
      setMessage({ kind: "error", text: errs["contact.fullName"] || errs["contact.email"] });
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      const { blob, filename } = await api.exportFile(kind, resume, state.pageSize);
      downloadBlob(blob, filename);
      setMessage({ kind: "success", text: `Downloaded ${filename}.` });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  };

  const setPageSize = (pageSize: PageSize) => patch({ pageSize, scoreStale: true });

  return (
    <section className="result" aria-labelledby="result-title">
      <div className="result-head">
        <div>
          <h1 id="result-title" className="display step-title" tabIndex={-1}>
            Your tailored resume
          </h1>
          <p className="step-lede">
            Tailored for <strong>{result.jd.title || "your target role"}</strong>. Review it, make any edits, then download.
          </p>
        </div>
        <div className="result-actions">
          <label className="pagesize">
            <span className="sr-only">Paper size</span>
            <select className="select" value={state.pageSize} onChange={(e) => setPageSize(e.target.value as PageSize)} aria-label="Paper size">
              <option value="A4">A4</option>
              <option value="Letter">US Letter</option>
            </select>
          </label>
          <button className="btn btn-secondary" onClick={() => download("docx")} disabled={!!busy}>
            {busy === "docx" ? <Spinner /> : <LuFileText aria-hidden="true" />} Word
          </button>
          <button className="btn btn-primary btn-lg" onClick={() => download("pdf")} disabled={!!busy}>
            {busy === "pdf" ? <Spinner /> : <LuDownload aria-hidden="true" />} Download Resume PDF
          </button>
        </div>
      </div>

      {message && (
        <div className="mb-16" aria-live="polite">
          <Notice kind={message.kind}>{message.text}</Notice>
        </div>
      )}
      {result.engineNotice && (
        <div className="mb-16">
          <Notice kind="info">{result.engineNotice}</Notice>
        </div>
      )}
      {result.guardNotes.length > 0 && (
        <div className="mb-16">
          <Notice kind="info" title="We kept your resume factual">
            <p>
              {result.guardNotes.length} AI suggestion{result.guardNotes.length > 1 ? "s were" : " was"} replaced with your original wording because {result.guardNotes.length > 1 ? "they" : "it"} added details you didn't provide:
            </p>
            <ul className="plain-list">
              {result.guardNotes.slice(0, 4).map((n, i) => (
                <li key={i}>
                  {n.location}: {n.reason}.
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <div className="result-grid">
        <div className="result-main">
          <div className="tabs" role="tablist" aria-label="Resume view">
            <button role="tab" id="tab-preview" aria-selected={tab === "preview"} aria-controls="panel-preview" className={tab === "preview" ? "is-on" : ""} onClick={() => setTab("preview")}>
              <LuEye aria-hidden="true" /> Preview
            </button>
            <button role="tab" id="tab-edit" aria-selected={tab === "edit"} aria-controls="panel-edit" className={tab === "edit" ? "is-on" : ""} onClick={() => setTab("edit")}>
              <LuPencil aria-hidden="true" /> Edit resume
            </button>
          </div>
          <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" hidden={tab !== "preview"}>
            {tab === "preview" && <PdfPreview resume={resume} pageSize={state.pageSize} />}
          </div>
          <div id="panel-edit" role="tabpanel" aria-labelledby="tab-edit" hidden={tab !== "edit"}>
            {tab === "edit" && (
              <>
                <p className="edit-note">
                  <LuInfo aria-hidden="true" /> Your changes appear in the Preview tab and in the download. Recalculate your score when you're done.
                </p>
                <ResumeEditor resume={resume} onChange={onEdit} />
                <div className="edit-footer">
                  <button className="btn btn-secondary" onClick={() => setTab("preview")}>
                    <LuEye aria-hidden="true" /> See preview
                  </button>
                  <button className="btn btn-primary" onClick={recalc} disabled={busy === "score"}>
                    {busy === "score" ? <Spinner label="Recalculating…" /> : "Recalculate ATS Score"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <aside className="result-side" aria-label="ATS analysis">
          <ScorePanel
            report={report}
            baseline={state.method === "upload" ? result.baseline.total : undefined}
            stale={state.scoreStale}
            busy={busy === "score"}
            onRecalculate={recalc}
            changes={result.changes}
            pageCount={state.pageCount}
          />
        </aside>
      </div>

      <div className="step-actions result-foot">
        <button className="btn btn-ghost" onClick={() => go(state.returnStep === "review-upload" ? "review-upload" : "form")}>
          <LuArrowLeft aria-hidden="true" /> Back to my details
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            if (confirm("Start over? This clears your job description, details and resume from this tab.")) reset();
          }}
        >
          <LuRotateCcw aria-hidden="true" /> Start over
        </button>
      </div>
    </section>
  );
}
