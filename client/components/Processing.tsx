import { useEffect, useRef, useState } from "react";
import { LuCheck, LuLoaderCircle, LuArrowLeft, LuRotateCcw } from "react-icons/lu";
import { useBuilder } from "../lib/store";
import { api } from "../lib/api";
import { GENERATION_STAGES } from "../../shared/types";
import { Notice } from "./ui";

type Status = "pending" | "active" | "done";

export function Processing() {
  const { state, go } = useBuilder();
  const [status, setStatus] = useState<Status[]>(() => GENERATION_STAGES.map(() => "pending"));
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number>(-1);
  const snapshot = useRef({ profile: state.profile, jdText: state.jdText, pageSize: state.pageSize });

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    let cancelled = false;
    setError(null);
    setStatus(GENERATION_STAGES.map(() => "pending"));
    const { profile, jdText, pageSize } = snapshot.current;
    api
      .generate(profile, jdText, pageSize, (index, st) => {
        if (!cancelled) setStatus((s) => s.map((x, i) => (i === index ? st : x)));
      })
      .then((result) => {
        if (cancelled) return;
        setStatus(GENERATION_STAGES.map(() => "done"));
        // A short beat so the final checkmark is visible before switching screens.
        setTimeout(() => {
          if (!cancelled)
            go("result", { result, resume: result.resume, report: result.report, pageCount: result.pageCount, scoreStale: false, jd: result.jd });
        }, 350);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, go]);

  const done = status.filter((s) => s === "done").length;
  const pct = Math.round((done / GENERATION_STAGES.length) * 100);

  return (
    <section className="step step-narrow" aria-labelledby="proc-title">
      <h1 id="proc-title" className="display step-title">
        {error ? "We hit a problem" : "Building your resume"}
      </h1>
      <p className="step-lede">{error ? "Your details are safe in this tab. You can try again or go back and adjust them." : `Tailoring it for ${state.jd?.title || "your target role"}.`}</p>

      <div className="panel processing">
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Resume generation progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <ol className="stage-list" aria-live="polite">
          {GENERATION_STAGES.map((label, i) => (
            <li key={label} className={`stage stage-${status[i]}`}>
              <span className="stage-icon" aria-hidden="true">
                {status[i] === "done" ? <LuCheck /> : status[i] === "active" ? <LuLoaderCircle className="spin" /> : <span className="stage-dot" />}
              </span>
              <span>{label}</span>
              <span className="sr-only">{status[i] === "done" ? "complete" : status[i] === "active" ? "in progress" : "waiting"}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <>
          <div className="mt-16">
            <Notice kind="error">{error}</Notice>
          </div>
          <div className="step-actions">
            <button className="btn btn-ghost" onClick={() => go(state.returnStep === "review-upload" ? "review-upload" : "form")}>
              <LuArrowLeft aria-hidden="true" /> Back to my details
            </button>
            <button className="btn btn-primary" onClick={() => setAttempt((a) => a + 1)}>
              <LuRotateCcw aria-hidden="true" /> Try again
            </button>
          </div>
        </>
      )}
    </section>
  );
}
