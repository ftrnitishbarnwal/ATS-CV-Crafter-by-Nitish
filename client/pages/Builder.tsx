import { useEffect, useRef } from "react";
import { LuRotateCcw } from "react-icons/lu";
import { BuilderProvider, useBuilder, type Step } from "../lib/store";
import { navigate } from "../lib/router";
import { Logo } from "../components/ui";
import { StepJD } from "../components/StepJD";
import { StepMethod, StepUpload, ReviewUpload } from "../components/Steps";
import { ProfileForm } from "../components/ProfileForm";
import { Processing } from "../components/Processing";
import { Result } from "../components/Result";

const PHASES = ["Job", "Your details", "Build", "Review"];
const PHASE_OF: Record<Step, number> = { jd: 0, method: 1, upload: 1, "review-upload": 1, form: 1, generating: 2, result: 3 };

function Shell() {
  const { state, reset, go } = useBuilder();
  const phase = PHASE_OF[state.step];
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Move focus to the new step's heading for screen reader and keyboard users.
    const h = mainRef.current?.querySelector<HTMLElement>("h1[tabindex='-1']");
    h?.focus({ preventScroll: true });
    document.title = `${["Target job", "Your details", "Building", "Your resume"][phase]} · TailorCV`;
  }, [state.step, phase]);

  return (
    <div className="app">
      <a className="skip-link" href="#builder-main">
        Skip to content
      </a>
      <header className="app-bar">
        <div className="app-bar-inner">
          <a
            href="/"
            className="nav-logo"
            onClick={(e) => {
              e.preventDefault();
              navigate("/");
            }}
            aria-label="TailorCV home"
          >
            <Logo />
          </a>
          <ol className="phases" aria-label="Progress">
            {PHASES.map((p, i) => (
              <li key={p} className={i < phase ? "is-done" : i === phase ? "is-current" : ""} aria-current={i === phase ? "step" : undefined}>
                <span className="phase-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="phase-label">{p}</span>
              </li>
            ))}
          </ol>
          {state.step !== "jd" && state.step !== "generating" ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm("Start over? This clears your job description and details from this tab.")) reset();
              }}
            >
              <LuRotateCcw aria-hidden="true" /> <span className="hide-sm">Start over</span>
            </button>
          ) : (
            <span className="bar-spacer" />
          )}
        </div>
      </header>
      <main id="builder-main" ref={mainRef} className="app-main">
        {state.step === "jd" && <StepJD />}
        {state.step === "method" && <StepMethod />}
        {state.step === "upload" && <StepUpload />}
        {state.step === "review-upload" && <ReviewUpload />}
        {state.step === "form" && <ProfileForm />}
        {state.step === "generating" && <Processing />}
        {state.step === "result" && <Result />}
        {!(state.step in PHASE_OF) && (
          <button className="btn btn-primary" onClick={() => go("jd")}>
            Start
          </button>
        )}
      </main>
      <footer className="app-foot">Your details stay in this browser tab. Nothing is saved on our servers.</footer>
    </div>
  );
}

export function Builder() {
  return (
    <BuilderProvider>
      <Shell />
    </BuilderProvider>
  );
}
