import { useId, type ReactNode, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { LuCircleAlert, LuTriangleAlert, LuInfo, LuCircleCheck, LuLoaderCircle } from "react-icons/lu";
import { MONTH_LABELS } from "../../shared/dates";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`logo${light ? " logo-light" : ""}`}>
      <svg viewBox="0 0 32 32" aria-hidden="true" width="26" height="26">
        <rect width="32" height="32" rx="7" fill={light ? "#fff" : "#14213D"} />
        <path d="M9 9h14v3h-5.5v12h-3V12H9z" fill={light ? "#14213D" : "#fff"} />
        <path d="M19.5 20.5l2.2 2.2 4.3-4.6" fill="none" stroke="#3FA37A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="logo-word">TailorCV</span>
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner" role="status">
      <LuLoaderCircle className="spin" aria-hidden="true" />
      {label && <span>{label}</span>}
    </span>
  );
}

export function Notice({ kind, children, title }: { kind: "error" | "warn" | "info" | "success"; children: ReactNode; title?: string }) {
  const Icon = kind === "error" ? LuCircleAlert : kind === "warn" ? LuTriangleAlert : kind === "success" ? LuCircleCheck : LuInfo;
  return (
    <div className={`notice notice-${kind}`} role={kind === "error" ? "alert" : "status"}>
      <Icon aria-hidden="true" />
      <div>
        {title && <strong className="notice-title">{title}</strong>}
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  counter?: string;
}

function FieldShell({ id, label, error, hint, optional, className, counter, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className={`field ${className ?? ""}`}>
      <label className="field-label" htmlFor={id}>
        <span>
          {label} {optional && <span className="optional">(optional)</span>}
        </span>
        {counter && <span className="field-counter">{counter}</span>}
      </label>
      {children}
      {hint && !error && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${id}-err`}>
          <LuCircleAlert aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, optional, className, value, onChange, ...rest }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} className={className}>
      <input
        id={id}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({ label, error, hint, optional, className, value, onChange, counter, ...rest }: FieldProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & { value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} optional={optional} className={className} counter={counter}>
      <textarea
        id={id}
        className="textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

const YEARS = (() => {
  const now = new Date().getFullYear();
  const out: string[] = [];
  for (let y = now + 6; y >= 1970; y--) out.push(String(y));
  return out;
})();

/** Month + year picker storing "YYYY-MM" / "YYYY" / "". */
export function MonthYearField({ label, value, onChange, error, disabled, optional, yearOnly }: { label: string; value: string; onChange: (v: string) => void; error?: string; disabled?: boolean; optional?: boolean; yearOnly?: boolean }) {
  const id = useId();
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(value || "");
  const year = m?.[1] ?? "";
  const month = m?.[2] ?? "";
  const set = (y: string, mo: string) => onChange(y ? (mo ? `${y}-${mo}` : y) : "");
  return (
    <div className="field">
      <span className="field-label" id={`${id}-l`}>
        <span>
          {label} {optional && <span className="optional">(optional)</span>}
        </span>
      </span>
      <div className={yearOnly ? "" : "monthyear"} role="group" aria-labelledby={`${id}-l`}>
        {!yearOnly && (
          <select className="select" aria-label={`${label} month`} value={month} disabled={disabled || !year} onChange={(e) => set(year, e.target.value)} aria-invalid={error ? true : undefined}>
            <option value="">Month</option>
            {MONTH_LABELS.map((lbl, i) => (
              <option key={lbl} value={String(i + 1).padStart(2, "0")}>
                {lbl}
              </option>
            ))}
          </select>
        )}
        <select className="select" aria-label={`${label} year`} value={year} disabled={disabled} onChange={(e) => set(e.target.value, e.target.value ? month : "")} aria-invalid={error ? true : undefined}>
          <option value="">Year</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <span className="field-error">
          <LuCircleAlert aria-hidden="true" />
          {error}
        </span>
      )}
    </div>
  );
}
