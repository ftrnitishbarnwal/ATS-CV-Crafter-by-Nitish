import { useState, type ReactNode } from "react";
import { LuCheck, LuChevronDown, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import type { AtsReport, Insight } from "../../shared/types";

export function ScoreRing({ value, size = 132, label }: { value: number; size?: number; label?: string }) {
  const stroke = size > 100 ? 10 : 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = value >= 85 ? "var(--match)" : value >= 65 ? "var(--primary)" : "var(--warn)";
  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={`${label ?? "Optimization score"}: ${value} out of 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * value) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="ring-arc"
        />
      </svg>
      <span className="ring-value" aria-hidden="true">
        <span className="ring-num" style={{ fontSize: size * 0.3 }}>
          {value}
        </span>
        <span className="ring-of">/100</span>
      </span>
    </div>
  );
}

function InsightList({ items }: { items: Insight[] }) {
  return (
    <ul className="insight-list">
      {items.map((w, i) => (
        <li key={i} className={`sev-${w.severity}`}>
          <strong>{w.area}.</strong> {w.message}
        </li>
      ))}
    </ul>
  );
}

function Collapsible({ title, count, children, defaultOpen = true }: { title: string; count?: number; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`collapsible${open ? " is-open" : ""}`}>
      <h3>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span>
            {title}
            {count != null && <span className="count-pill">{count}</span>}
          </span>
          <LuChevronDown aria-hidden="true" />
        </button>
      </h3>
      {open && <div className="collapsible-body">{children}</div>}
    </section>
  );
}

const compact = () => typeof window !== "undefined" && window.matchMedia?.("(max-width: 1020px)").matches;

export function ScorePanel({
  report,
  baseline,
  stale,
  busy,
  onRecalculate,
  changes,
  pageCount,
}: {
  report: AtsReport;
  baseline?: number;
  stale: boolean;
  busy: boolean;
  onRecalculate: () => void;
  changes: string[];
  pageCount: number;
}) {
  const req = report.keywordMatches.filter((m) => m.importance === "required");
  const pref = report.keywordMatches.filter((m) => m.importance === "preferred");
  const delta = baseline != null ? report.total - baseline : 0;
  return (
    <div className="score-panel">
      <div className="score-head">
        <ScoreRing value={report.total} label="ATS optimization score" />
        <div className="score-head-text">
          <h2>
            ATS Optimization Score<span className="sr-only">: {report.total}/100</span>
          </h2>
          <p className="score-verdict">{report.total >= 90 ? "Strong match for this job" : report.total >= 75 ? "Good match, with room to improve" : report.total >= 60 ? "Fair match: see the gaps below" : "Weak match: see the gaps below"}</p>
          {baseline != null && (
            <p className={`score-delta${delta > 0 ? " up" : ""}`}>{delta > 0 ? `Up ${delta} points from your original (${baseline})` : delta === 0 ? `Same as your original (${baseline})` : `Your original scored ${baseline}`}</p>
          )}
          <p className="score-meta">
            {pageCount} page{pageCount > 1 ? "s" : ""}, {report.stats.bulletCount} bullet points
          </p>
        </div>
      </div>

      {stale && (
        <div className="stale">
          <LuTriangleAlert aria-hidden="true" />
          <span>You've edited your resume. Recalculate to update the score.</span>
        </div>
      )}
      <button className="btn btn-secondary btn-block" onClick={onRecalculate} disabled={busy}>
        <LuRefreshCw aria-hidden="true" className={busy ? "spin" : ""} /> {busy ? "Recalculating…" : "Recalculate ATS Score"}
      </button>

      <Collapsible title="Score breakdown" defaultOpen={!compact()}>
        <ul className="breakdown">
          {report.components.map((c) => (
            <li key={c.key}>
              <div className="breakdown-row">
                <span>{c.label}</span>
                <span className="breakdown-val">
                  {Math.round(c.score)}/{c.max}
                </span>
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${(c.score / c.max) * 100}%` }} className={c.score / c.max >= 0.85 ? "good" : c.score / c.max >= 0.6 ? "ok" : "low"} />
              </div>
              <p className="breakdown-detail">{c.detail}</p>
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible title="Keyword match analysis" count={report.keywordMatches.filter((m) => m.found).length}>
        {req.length > 0 && (
          <>
            <p className="kw-label">
              Required: {req.filter((m) => m.found).length} of {req.length} found
            </p>
            <ul className="chip-row">
              {req.map((m) => (
                <li key={m.term} className={`chip ${m.found ? "chip-match" : "chip-miss"}`}>
                  {m.found && <LuCheck aria-hidden="true" />}
                  {m.term}
                  <span className="sr-only">{m.found ? "found" : "missing"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {pref.length > 0 && (
          <>
            <p className="kw-label">
              Preferred: {pref.filter((m) => m.found).length} of {pref.length} found
            </p>
            <ul className="chip-row">
              {pref.map((m) => (
                <li key={m.term} className={`chip chip-pref ${m.found ? "chip-match" : "chip-miss"}`}>
                  {m.found && <LuCheck aria-hidden="true" />}
                  {m.term}
                  <span className="sr-only">{m.found ? "found" : "missing"}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {!report.keywordMatches.length && <p className="field-hint">No specific keywords were detected in this job description.</p>}
      </Collapsible>

      <Collapsible title="Missing or weak areas" count={report.weakAreas.length}>
        {report.weakAreas.length ? <InsightList items={report.weakAreas} /> : <p className="field-hint">Nothing major is missing.</p>}
      </Collapsible>

      <Collapsible title="Suggested improvements" count={report.suggestions.length} defaultOpen={!compact()}>
        {report.suggestions.length ? <InsightList items={report.suggestions} /> : <p className="field-hint">No further suggestions.</p>}
      </Collapsible>

      {changes.length > 0 && (
        <Collapsible title="What we changed" count={changes.length} defaultOpen={false}>
          <ul className="insight-list changes">
            {changes.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </Collapsible>
      )}

      <p className="disclaimer">This score is TailorCV's measurable estimate of how well your resume matches this job and reads in applicant tracking systems. Real ATS software and recruiters vary, so no score guarantees an interview.</p>
    </div>
  );
}
