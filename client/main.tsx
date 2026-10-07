import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Landing } from "./pages/Landing";
import { Builder } from "./pages/Builder";
import { currentPath, onRoute } from "./lib/router";
import "./styles/base.css";
import "./styles/landing.css";
import "./styles/builder.css";

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <h1 className="display">Something went wrong</h1>
        <p>An unexpected error interrupted the page. Your details are kept in this tab, so reloading usually fixes it.</p>
        <div className="crash-actions">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Reload the page
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              try {
                sessionStorage.clear();
              } catch {
                /* ignore */
              }
              location.href = "/";
            }}
          >
            Clear and start over
          </button>
        </div>
      </div>
    );
  }
}

function App() {
  const [path, setPath] = useState(currentPath());
  useEffect(() => onRoute(setPath), []);
  return <ErrorBoundary>{path.startsWith("/build") ? <Builder /> : <Landing />}</ErrorBoundary>;
}

createRoot(document.getElementById("root")!).render(<App />);
