import { useEffect, useRef, useState } from "react";
import { LuClipboardPaste } from "react-icons/lu";
import { useBuilder } from "../lib/store";
import { api } from "../lib/api";
import { validateJd, LIMITS } from "../../shared/validation";
import { wordCount } from "../../shared/util";
import { Notice, Spinner } from "./ui";

const PLACEHOLDER = `Paste the complete job posting here, for example:

Senior Data Analyst — Acme Corp
Responsibilities
• Build dashboards and reports for the sales team…
Requirements
• 3+ years of experience with SQL and Python…`;

export function StepJD() {
  const { state, patch, go } = useBuilder();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = state.jdText;
  const words = wordCount(text);
  const over = text.length > LIMITS.jdMaxChars;

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const next = async () => {
    const err = validateJd(text);
    if (err) {
      setError(err);
      ref.current?.focus();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const jd = await api.analyzeJd(text);
      go("method", { jd, jdText: text.trim(), scoreStale: !!state.resume });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) {
        patch({ jdText: t.slice(0, LIMITS.jdMaxChars + 5000) });
        setError(null);
      }
    } catch {
      setError("Your browser blocked clipboard access. Click in the box and press Ctrl+V (or ⌘V) to paste.");
    }
  };

  return (
    <section className="step step-narrow" aria-labelledby="jd-title">
      <h1 id="jd-title" className="display step-title" tabIndex={-1}>
        What job are you targeting?
      </h1>
      <p className="step-lede">Paste the full posting, including the responsibilities and requirements. The more complete it is, the better we can tailor your resume.</p>

      <div className="panel">
        <div className="field">
          <div className="field-label">
            <label htmlFor="jd">Paste Your Target Job Description</label>
            {"clipboard" in navigator && (
              <button type="button" className="btn btn-ghost btn-sm paste-btn" onClick={pasteFromClipboard}>
                <LuClipboardPaste aria-hidden="true" /> Paste
              </button>
            )}
          </div>
          <textarea
            id="jd"
            ref={ref}
            className="textarea jd-textarea"
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => {
              patch({ jdText: e.target.value });
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby="jd-count jd-err"
            spellCheck={false}
          />
          <div className="jd-meta">
            <span id="jd-count" className={over ? "count-over" : ""} aria-live="polite">
              {words.toLocaleString()} {words === 1 ? "word" : "words"}, {text.length.toLocaleString()} / {LIMITS.jdMaxChars.toLocaleString()} characters
            </span>
            {text && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch({ jdText: "" })}>
                Clear
              </button>
            )}
          </div>
        </div>
        {error && (
          <div id="jd-err">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </div>

      <div className="step-actions">
        <span />
        <button className="btn btn-primary btn-lg" onClick={next} disabled={busy}>
          {busy ? <Spinner label="Reading the job…" /> : "Next →"}
        </button>
      </div>
    </section>
  );
}
