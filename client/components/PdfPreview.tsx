import { useEffect, useRef, useState } from "react";
import type { Resume, PageSize } from "../../shared/types";
import { api } from "../lib/api";
import { Notice, Spinner } from "./ui";

declare const __PDF_WORKER__: string;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((m) => {
    m.GlobalWorkerOptions.workerSrc = __PDF_WORKER__;
    return m;
  });
  return pdfjsPromise;
}

/** Renders the exact PDF the user will download, page by page. */
export function PdfPreview({ resume, pageSize }: { resume: Resume; pageSize: PageSize }) {
  const host = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const [{ blob }, lib] = await Promise.all([api.exportFile("pdf", resume, pageSize), loadPdfJs()]);
        if (my !== seq.current) return;
        const data = new Uint8Array(await blob.arrayBuffer());
        const doc = await lib.getDocument({ data }).promise;
        const container = host.current;
        if (!container || my !== seq.current) return;
        const width = Math.max(600, container.clientWidth);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const canvases: HTMLCanvasElement[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const scale = width / base.width;
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "pdf-page";
          canvas.setAttribute("aria-hidden", "true");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("no canvas");
          await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
          canvases.push(canvas);
        }
        await doc.destroy();
        if (my !== seq.current) return;
        container.replaceChildren(...canvases);
        setPages(canvases.length);
        setError(null);
      } catch (e) {
        if (my === seq.current) setError((e as Error).message && !(e as Error).message.includes("canvas") ? (e as Error).message : "The preview couldn't be displayed.");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [resume, pageSize]);

  return (
    <div className="preview">
      <div className="preview-bar">
        <span>{pages ? `${pages} page${pages > 1 ? "s" : ""}, ${pageSize === "A4" ? "A4" : "US Letter"}` : "Preview"}</span>
        {loading && <Spinner label="Updating preview…" />}
      </div>
      {error && (
        <div className="mb-16">
          <Notice kind="warn">{error} You can still download your resume.</Notice>
        </div>
      )}
      <div className={`preview-pages${loading && pages ? " is-dim" : ""}`} ref={host} role="img" aria-label={`Preview of your resume${pages ? `, ${pages} page${pages > 1 ? "s" : ""}` : ""}. Use the Edit tab to read or change the text.`} />
      {!pages && loading && (
        <div className="preview-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
