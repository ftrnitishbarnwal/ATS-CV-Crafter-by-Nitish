/**
 * Resume file handling: type detection by content (magic bytes), then text extraction.
 * Files are processed in memory only and never written to disk.
 */
import JSZip from "jszip";
import { UserError } from "../http";

export type FileKind = "pdf" | "docx" | "txt";

const MIN_TEXT = 40;

export function detectKind(buf: Buffer, filename: string): FileKind {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (buf.length === 0) throw new UserError(400, "This file is empty. Choose a different file.", "empty_file");
  const head = buf.subarray(0, 8);
  const isPdf = buf.subarray(0, 1024).includes(Buffer.from("%PDF-"));
  const isZip = head[0] === 0x50 && head[1] === 0x4b && (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07);
  const isOle = head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  if (isPdf) return "pdf";
  if (isZip) {
    if (ext === "docx" || ext === "dotx" || !ext) return "docx";
    throw new UserError(415, "This file type isn't supported. Upload a PDF, DOCX or TXT file.", "unsupported_type");
  }
  if (isOle) throw new UserError(415, "Older .doc files aren't supported. Save it as .docx or PDF and upload again.", "legacy_doc");
  if (ext === "pdf") throw new UserError(422, "This PDF appears to be damaged and couldn't be opened. Export it again or upload a DOCX.", "corrupt_pdf");
  if (ext === "docx") throw new UserError(422, "This Word file appears to be damaged and couldn't be opened. Save it again or upload a PDF.", "corrupt_docx");
  if (looksBinary(buf)) throw new UserError(415, "This file type isn't supported. Upload a PDF, DOCX or TXT file.", "unsupported_type");
  return "txt";
}

function looksBinary(buf: Buffer): boolean {
  if (buf[0] === 0xff && buf[1] === 0xfe) return false; // UTF-16 LE BOM
  if (buf[0] === 0xfe && buf[1] === 0xff) return false; // UTF-16 BE BOM
  const sample = buf.subarray(0, 4096);
  let ctrl = 0;
  for (const b of sample) if (b === 0 || (b < 9) || (b > 13 && b < 32)) ctrl++;
  return ctrl / Math.max(1, sample.length) > 0.05;
}

export async function extractText(buf: Buffer, filename: string): Promise<{ text: string; kind: FileKind; pages?: number }> {
  const kind = detectKind(buf, filename);
  let text = "";
  let pages: number | undefined;
  if (kind === "pdf") {
    const r = await extractPdf(buf);
    text = r.text;
    pages = r.pages;
  } else if (kind === "docx") text = await extractDocx(buf);
  else text = decodeText(buf);

  text = text.replace(/\u0000/g, "").replace(/[​-‍﻿]/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (text.replace(/\s/g, "").length < MIN_TEXT) {
    if (kind === "pdf") {
      throw new UserError(422, "We couldn't find any text in this PDF. It may be a scanned image. Upload a text-based PDF or DOCX, or build your resume from details instead.", "no_text");
    }
    throw new UserError(422, "This file doesn't contain enough text to be a resume. Check the file or build your resume from details instead.", "no_text");
  }
  if (text.length > 60_000) text = text.slice(0, 60_000);
  return { text, kind, pages };
}

/* ---------------------------------- TXT ---------------------------------- */

function decodeText(buf: Buffer): string {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  const utf8 = buf.toString("utf8");
  const bad = (utf8.match(/�/g) || []).length;
  return bad > 5 ? buf.toString("latin1") : utf8;
}

/* ---------------------------------- PDF ---------------------------------- */

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

let pdfjsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;
function pdfjs() {
  pdfjsPromise ??= import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

async function extractPdf(buf: Buffer): Promise<{ text: string; pages: number }> {
  const lib = await pdfjs();
  let doc;
  try {
    doc = await lib.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: false,
      disableFontFace: true,
      verbosity: 0,
      stopAtErrors: false,
    }).promise;
  } catch (e) {
    const name = (e as Error)?.name || "";
    if (name === "PasswordException") throw new UserError(422, "This PDF is password-protected. Remove the password and upload it again.", "pdf_password");
    throw new UserError(422, "This PDF appears to be damaged and couldn't be opened. Export it again or upload a DOCX.", "corrupt_pdf");
  }
  const maxPages = Math.min(doc.numPages, 10);
  const pageTexts: string[] = [];
  try {
    for (let p = 1; p <= maxPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: Item[] = [];
      for (const it of content.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
        if (typeof it.str !== "string" || !it.transform) continue;
        if (!it.str.trim()) continue;
        const [a, b, , d, e, f] = it.transform;
        const size = Math.hypot(a, b) || Math.abs(d) || it.height || 10;
        items.push({ str: it.str, x: e, y: f, w: it.width ?? it.str.length * size * 0.5, h: size });
      }
      pageTexts.push(layoutPage(items, viewport.width));
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return { text: pageTexts.join("\n\n"), pages: doc.numPages };
}

function groupRows(items: Item[]): Item[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= Math.max(2, Math.min(row[0].h, it.h) * 0.45)) row.push(it);
    else rows.push([it]);
  }
  for (const r of rows) r.sort((a, b) => a.x - b.x);
  return rows;
}

function rowText(row: Item[]): string {
  let out = "";
  let prevEnd = -Infinity;
  for (const it of row) {
    const gap = it.x - prevEnd;
    if (out) {
      if (gap > it.h * 2.5) out += "   ";
      else if (gap > it.h * 0.15 && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
    }
    out += it.str;
    prevEnd = it.x + it.w;
  }
  return out.replace(/[ \t]+$/g, "");
}

/**
 * Reconstruct reading order. Detects a two-column layout (a consistent vertical gutter)
 * and emits the left column before the right one so sections don't interleave.
 */
function layoutPage(items: Item[], pageWidth: number): string {
  if (!items.length) return "";
  const rows = groupRows(items);
  const gutter = findGutter(rows, pageWidth);
  if (gutter == null) return rows.map(rowText).join("\n");
  const left: Item[] = [];
  const right: Item[] = [];
  for (const it of items) (it.x < gutter ? left : right).push(it);
  // Full-width rows (e.g. the name header) span the gutter: keep them in the left stream.
  return [groupRows(left).map(rowText).join("\n"), groupRows(right).map(rowText).join("\n")].join("\n");
}

function findGutter(rows: Item[][], pageWidth: number): number | null {
  if (rows.length < 12) return null;
  // Candidate column starts: items beyond 25% of the page that begin a row or follow a wide gap.
  const starts: number[] = [];
  for (const r of rows) {
    for (let i = 0; i < r.length; i++) {
      const x = r[i].x;
      if (x < pageWidth * 0.25 || x > pageWidth * 0.7) continue;
      const prevEnd = i > 0 ? r[i - 1].x + r[i - 1].w : -Infinity;
      if (i === 0 || x - prevEnd > 20) {
        starts.push(x);
        break;
      }
    }
  }
  if (starts.length < rows.length * 0.35) return null;
  starts.sort((a, b) => a - b);
  // Densest 14pt window of column starts
  let best = { lo: 0, count: 0 };
  for (let i = 0, j = 0; i < starts.length; i++) {
    while (starts[i] - starts[j] > 14) j++;
    if (i - j + 1 > best.count) best = { lo: starts[j], count: i - j + 1 };
  }
  if (best.count < rows.length * 0.35) return null;
  const g = best.lo - 6;
  const crossing = rows.filter((r) => r.some((it) => it.x < g - 10 && it.x + it.w > g + 4)).length;
  const leftRows = rows.filter((r) => r.some((it) => it.x + it.w < g)).length;
  if (crossing > rows.length * 0.15 || leftRows < rows.length * 0.2) return null;
  return g;
}

/* --------------------------------- DOCX --------------------------------- */

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function docxXmlToText(xml: string): string {
  const lines: string[] = [];
  let cur = "";
  let bullet = false;
  const flush = () => {
    const t = cur.replace(/[ \t]+$/g, "");
    if (t.trim()) lines.push((bullet ? "• " : "") + t.trim());
    else if (lines.length && lines[lines.length - 1] !== "") lines.push("");
    cur = "";
    bullet = false;
  };
  const re = /<w:p[\s>]|<\/w:p>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>|<w:numPr>|<w:pStyle w:val="([^"]+)"|<\/w:tc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tok = m[0];
    if (tok.startsWith("<w:p") && !tok.startsWith("<w:pStyle")) {
      if (cur.trim()) flush();
    } else if (tok === "</w:p>") flush();
    else if (tok.startsWith("<w:t")) cur += decodeXml(m[1] ?? "");
    else if (tok === "<w:tab/>") cur += "   ";
    else if (tok === "<w:br/>" || tok === "<w:cr/>") {
      flush();
    } else if (tok === "<w:numPr>") bullet = true;
    else if (tok.startsWith("<w:pStyle")) {
      if (/list|bullet/i.test(m[2] ?? "")) bullet = true;
    } else if (tok === "</w:tc>") {
      if (cur.trim()) flush();
    }
  }
  flush();
  return lines.join("\n");
}

async function extractDocx(buf: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new UserError(422, "This Word file appears to be damaged and couldn't be opened. Save it again or upload a PDF.", "corrupt_docx");
  }
  const main = zip.file("word/document.xml");
  if (!main) throw new UserError(415, "This file isn't a valid Word document. Upload a PDF, DOCX or TXT file.", "unsupported_type");
  const parts: string[] = [];
  const headers = Object.keys(zip.files).filter((n) => /^word\/header\d*\.xml$/.test(n)).sort();
  for (const h of headers) {
    const t = docxXmlToText(await zip.file(h)!.async("string"));
    if (t.trim()) parts.push(t);
  }
  parts.push(docxXmlToText(await main.async("string")));
  return parts.join("\n");
}
