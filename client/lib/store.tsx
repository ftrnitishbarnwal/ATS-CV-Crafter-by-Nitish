import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ProfileInput, ParseResult, JdAnalysis, AtsReport, Resume, PageSize, GenerationResult } from "../../shared/types";
import { emptyProfile } from "../../shared/util";

export type Step = "jd" | "method" | "upload" | "review-upload" | "form" | "generating" | "result";

export interface BuilderState {
  step: Step;
  jdText: string;
  jd: JdAnalysis | null;
  method: "upload" | "form" | null;
  profile: ProfileInput;
  formStep: number;
  fileName: string;
  parse: ParseResult | null;
  uploadAnalysis: { jd: JdAnalysis; report: AtsReport } | null;
  result: GenerationResult | null;
  resume: Resume | null;
  report: AtsReport | null;
  pageCount: number;
  scoreStale: boolean;
  pageSize: PageSize;
  /** Step to return to from generation (form or review-upload). */
  returnStep: Step;
}

const KEY = "tailorcv:v1";

export function initialState(): BuilderState {
  return {
    step: "jd",
    jdText: "",
    jd: null,
    method: null,
    profile: emptyProfile(),
    formStep: 0,
    fileName: "",
    parse: null,
    uploadAnalysis: null,
    result: null,
    resume: null,
    report: null,
    pageCount: 1,
    scoreStale: false,
    pageSize: "A4",
    returnStep: "form",
  };
}

/** Session-only persistence: survives a refresh, cleared when the tab closes. Nothing is stored on the server. */
function load(): BuilderState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return initialState();
    const s = { ...initialState(), ...JSON.parse(raw) } as BuilderState;
    if (s.step === "generating") s.step = s.returnStep || "form";
    if (s.step === "result" && !s.resume) s.step = "jd";
    return s;
  } catch {
    return initialState();
  }
}

interface Ctx {
  state: BuilderState;
  patch: (p: Partial<BuilderState> | ((s: BuilderState) => Partial<BuilderState>)) => void;
  go: (step: Step, extra?: Partial<BuilderState>) => void;
  reset: () => void;
}

const BuilderContext = createContext<Ctx | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BuilderState>(load);
  const first = useRef(true);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or disabled: the app still works without persistence */
    }
  }, [state]);

  // Browser back/forward moves between builder steps.
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const step = (e.state && e.state.step) as Step | undefined;
      if (step && step !== "generating") setState((s) => (step === "result" && !s.resume ? s : { ...s, step }));
    };
    window.addEventListener("popstate", onPop);
    if (first.current) {
      first.current = false;
      history.replaceState({ step: state.step }, "", location.pathname);
    }
    return () => window.removeEventListener("popstate", onPop);
  }, [state.step]);

  const patch = useCallback<Ctx["patch"]>((p) => setState((s) => ({ ...s, ...(typeof p === "function" ? p(s) : p) })), []);
  const go = useCallback<Ctx["go"]>((step, extra) => {
    setState((s) => ({ ...s, ...extra, step }));
    if (step !== "generating") history.pushState({ step }, "", location.pathname);
    window.scrollTo({ top: 0 });
  }, []);
  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setState(initialState());
    history.replaceState({ step: "jd" }, "", location.pathname);
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo(() => ({ state, patch, go, reset }), [state, patch, go, reset]);
  return <BuilderContext.Provider value={value}>{children}</BuilderContext.Provider>;
}

export function useBuilder(): Ctx {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error("useBuilder outside provider");
  return ctx;
}
