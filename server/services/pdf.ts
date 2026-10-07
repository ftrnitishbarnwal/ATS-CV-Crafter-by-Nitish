/**
 * ATS-safe PDF renderer built on pdf-lib.
 * Single column, standard Helvetica font (text is real, selectable and extractable),
 * standard section headings, no images or tables. Links are real URI annotations.
 */
import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFString, setCharacterSpacing } from "pdf-lib";
import type { Resume, PageSize } from "../../shared/types";
import { formatDate, formatRange } from "../../shared/dates";

const SIZES: Record<PageSize, [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792] };

const INK = rgb(0.1, 0.12, 0.16);
const NAVY = rgb(0.106, 0.227, 0.388); // #1B3A63
const MUTED = rgb(0.29, 0.33, 0.4);
const RULE = rgb(0.72, 0.77, 0.84);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
}

interface Seg {
  text: string;
  font: PDFFont;
  size: number;
  color?: ReturnType<typeof rgb>;
  link?: string;
}

/* ---------------------------- Text sanitizing ---------------------------- */

const REPLACEMENTS: [RegExp, string][] = [
  [/[  -   ]/g, " "],
  [/[​-‍﻿]/g, ""],
  [/[−‐‑]/g, "-"],
  [/₹/g, "INR "],
  [/[→⟶➜]/g, "->"],
  [/←/g, "<-"],
  [/≥/g, ">="],
  [/≤/g, "<="],
  [/[✓✔✅]/g, ""],
  [/[●▪■◦‣⁃➢➤►▶]/g, "•"],
  [/′/g, "'"],
  [/″/g, '"'],
];

function makeSanitizer(font: PDFFont): (s: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (input: string) => {
    let s = input ?? "";
    for (const [re, rep] of REPLACEMENTS) s = s.replace(re, rep);
    let out = "";
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (ch === "\n" || ch === "\t") {
        out += " ";
        continue;
      }
      if (supported.has(cp)) {
        out += ch;
        continue;
      }
      const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += [...base].filter((c) => supported.has(c.codePointAt(0)!)).join("");
    }
    return out.replace(/\s+/g, " ").trim();
  };
}

/* -------------------------------- Layout -------------------------------- */

class Writer {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  constructor(
    private doc: PDFDocument,
    readonly fonts: Fonts,
    readonly sanitize: (s: string) => string,
    readonly pageSize: [number, number],
    readonly k: number, // density factor (1 = normal)
  ) {
    this.left = 50;
    this.right = pageSize[0] - 50;
    this.top = pageSize[1] - 44;
    this.bottom = 46;
    this.newPage();
  }

  get width(): number {
    return this.right - this.left;
  }

  newPage(): void {
    this.page = this.doc.addPage(this.pageSize);
    this.pages.push(this.page);
    this.y = this.top;
  }

  ensure(h: number): void {
    if (this.y - h < this.bottom) this.newPage();
  }

  space(h: number): void {
    this.y -= h * this.k;
  }

  textWidth(s: string, font: PDFFont, size: number, tracking = 0): number {
    return font.widthOfTextAtSize(s, size) + tracking * Math.max(0, s.length - 1);
  }

  draw(s: string, x: number, font: PDFFont, size: number, color = INK, tracking = 0): number {
    const text = this.sanitize(s);
    if (!text) return 0;
    if (tracking) this.page.pushOperators(setCharacterSpacing(tracking));
    this.page.drawText(text, { x, y: this.y, size, font, color });
    if (tracking) this.page.pushOperators(setCharacterSpacing(0));
    return this.textWidth(text, font, size, tracking);
  }

  link(url: string, x: number, y: number, w: number, h: number): void {
    const href = /^https?:\/\//i.test(url) ? url : /^mailto:/i.test(url) ? url : `https://${url}`;
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y - 2, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(href) },
    });
    this.page.node.addAnnot(this.doc.context.register(annot));
  }

  /** Word-wrap rich segments into lines. Spaces are preserved as real characters for text extraction. */
  wrap(segs: Seg[], width: number): Seg[][] {
    const words: Seg[] = [];
    for (const s of segs) {
      const clean = this.sanitize(s.text);
      if (!clean) continue;
      if (/^\s/.test(s.text) && words.length && !words[words.length - 1].text.endsWith(" ")) words[words.length - 1].text += " ";
      const parts = clean.split(" ");
      parts.forEach((p, i) => {
        if (!p) return;
        words.push({ ...s, text: p + (i < parts.length - 1 || /\s$/.test(s.text) ? " " : "") });
      });
    }
    const lines: Seg[][] = [];
    let line: Seg[] = [];
    let w = 0;
    for (const wd of words) {
      const trimmedW = this.textWidth(wd.text.trimEnd(), wd.font, wd.size);
      const fullW = this.textWidth(wd.text, wd.font, wd.size);
      if (line.length && w + trimmedW > width) {
        lines.push(line);
        line = [];
        w = 0;
      }
      // Hard-break a single token longer than the line (e.g. a long URL)
      if (!line.length && trimmedW > width) {
        let chunk = "";
        for (const ch of wd.text) {
          if (this.textWidth(chunk + ch, wd.font, wd.size) > width) {
            lines.push([{ ...wd, text: chunk }]);
            chunk = "";
          }
          chunk += ch;
        }
        line = [{ ...wd, text: chunk }];
        w = this.textWidth(chunk, wd.font, wd.size);
        continue;
      }
      line.push(wd);
      w += fullW;
    }
    if (line.length) lines.push(line);
    return lines;
  }

  /** Draw a wrapped line, merging same-style words into single text runs (keeps real spaces in the PDF). */
  drawRichLine(line: Seg[], x: number): void {
    const runs: Seg[] = [];
    for (const s of line) {
      const last = runs[runs.length - 1];
      if (last && last.font === s.font && last.size === s.size && last.color === s.color && last.link === s.link) last.text += s.text;
      else runs.push({ ...s });
    }
    if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
    let cx = x;
    for (const r of runs) {
      if (!r.text) continue;
      this.page.drawText(r.text, { x: cx, y: this.y, size: r.size, font: r.font, color: r.color ?? INK });
      const w = this.textWidth(r.text, r.font, r.size);
      if (r.link) this.link(r.link, cx, this.y, this.textWidth(r.text.trimEnd(), r.font, r.size), r.size);
      cx += w;
    }
  }

  paragraph(segs: Seg[], opts: { indent?: number; hanging?: number; lineHeight: number; keep?: number }): void {
    const indent = opts.indent ?? 0;
    const hanging = opts.hanging ?? 0;
    const lines = this.wrap(segs, this.width - indent - hanging);
    lines.forEach((ln, i) => {
      this.ensure(opts.lineHeight * this.k);
      this.y -= opts.lineHeight * this.k;
      this.drawRichLine(ln, this.left + indent + (i > 0 ? hanging : 0));
    });
  }
}

/* ------------------------------- Sections ------------------------------- */

function displayUrl(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export interface RenderResult {
  bytes: Uint8Array;
  pageCount: number;
}

export async function renderResumePdf(resume: Resume, pageSize: PageSize = "A4"): Promise<RenderResult> {
  let best: RenderResult | null = null;
  for (const k of [1, 0.94, 0.88]) {
    const r = await renderOnce(resume, pageSize, k);
    if (!best) best = r;
    // Accept a tighter layout only if it saves a page (avoids a mostly-empty last page).
    if (r.pageCount < best.pageCount) {
      best = r;
      break;
    }
    if (r.pageCount === 1 || !r.lastPageSparse) break;
  }
  return { bytes: best!.bytes, pageCount: best!.pageCount };
}

async function renderOnce(resume: Resume, pageSize: PageSize, k: number): Promise<RenderResult & { lastPageSparse: boolean }> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
  };
  const sanitize = makeSanitizer(fonts.regular);
  const w = new Writer(doc, fonts, sanitize, SIZES[pageSize], k);
  const c = resume.contact;
  const BODY = 9.8;
  const LH = 13.4;

  /* Header */
  w.y -= 20;
  w.draw(c.fullName || "Your Name", w.left, fonts.bold, 21, INK);
  if (c.title) {
    w.y -= 16;
    w.draw(c.title, w.left, fonts.regular, 11.5, NAVY);
  }
  const contactBits: Seg[] = [];
  const addBit = (text: string, link?: string) => {
    if (!text) return;
    if (contactBits.length) contactBits.push({ text: "  |  ", font: fonts.regular, size: 9, color: RULE });
    contactBits.push({ text, font: fonts.regular, size: 9, color: MUTED, link });
  };
  addBit(c.email, c.email ? `mailto:${c.email}` : undefined);
  addBit(c.phone);
  addBit(c.location);
  for (const u of [c.linkedin, c.github, c.portfolio, ...c.otherLinks]) if (u) addBit(displayUrl(u), u);
  if (contactBits.length) {
    w.y -= 4;
    w.paragraph(contactBits, { lineHeight: 12.5 });
  }
  w.y -= 4;

  const heading = (title: string) => {
    w.ensure(62 * k);
    w.space(21);
    w.draw(title.toUpperCase(), w.left, fonts.bold, 10.2, NAVY, 0.9);
    w.y -= 5;
    w.page.drawLine({ start: { x: w.left, y: w.y }, end: { x: w.right, y: w.y }, thickness: 0.7, color: RULE });
    w.space(2);
  };

  const bullets = (items: string[]) => {
    for (const b of items) {
      const lines = w.wrap([{ text: b, font: fonts.regular, size: BODY }], w.width - 14);
      lines.forEach((ln, i) => {
        w.ensure(LH * k);
        w.y -= LH * k;
        if (i === 0) w.draw("•", w.left + 3, fonts.regular, BODY, INK);
        w.drawRichLine(ln, w.left + 14);
      });
    }
  };

  const rightText = (text: string, font: PDFFont, size: number, color = MUTED) => {
    const t = sanitize(text);
    if (!t) return 0;
    const tw = w.textWidth(t, font, size);
    w.draw(t, w.right - tw, font, size, color);
    return tw;
  };

  /** Left text that stays clear of right-aligned text on the same line (wraps if needed). */
  const leftRight = (left: Seg[], right: string) => {
    const rw = right ? w.textWidth(sanitize(right), fonts.regular, 9.2) + 12 : 0;
    const lines = w.wrap(left, w.width - rw);
    lines.forEach((ln, i) => {
      w.y -= 13.6 * k;
      w.drawRichLine(ln, w.left);
      if (i === 0 && right) rightText(right, fonts.regular, 9.2);
    });
  };

  const labeled = (label: string, value: string, size = 9.2) => {
    w.paragraph(
      [
        { text: `${label}: `, font: fonts.bold, size, color: INK },
        { text: value, font: fonts.regular, size, color: INK },
      ],
      { lineHeight: 12.6, hanging: 0 },
    );
  };

  for (const key of resume.sectionOrder) {
    switch (key) {
      case "summary":
        if (!resume.summary) break;
        heading("Summary");
        w.space(1);
        w.paragraph([{ text: resume.summary, font: fonts.regular, size: BODY }], { lineHeight: LH });
        break;

      case "skills":
        if (!resume.skills.length) break;
        heading("Skills");
        w.space(1);
        for (const g of resume.skills) {
          w.paragraph(
            [
              { text: `${g.category}: `, font: fonts.bold, size: BODY },
              { text: g.items.join(", "), font: fonts.regular, size: BODY },
            ],
            { lineHeight: LH },
          );
        }
        break;

      case "experience":
        if (!resume.experience.length) break;
        heading("Experience");
        resume.experience.forEach((e, idx) => {
          w.ensure((idx ? 8 : 0) + 13.6 * 2 + LH * 2);
          if (idx) w.space(7);
          leftRight([{ text: e.title || e.company, font: fonts.bold, size: 10.4 }], formatRange(e.startDate, e.endDate, e.current));
          const sub = [e.title ? e.company : "", e.location].filter(Boolean).join("  •  ");
          if (sub) {
            w.y -= 12.4 * k;
            w.draw(sub, w.left, fonts.italic, 9.6, MUTED);
          }
          w.space(1.5);
          bullets(e.bullets);
          if (e.technologies.length) labeled("Technologies", e.technologies.join(", "));
        });
        break;

      case "projects":
        if (!resume.projects.length) break;
        heading("Projects");
        resume.projects.forEach((p, idx) => {
          w.ensure(13.6 + LH * 2);
          if (idx) w.space(6);
          const segs: Seg[] = [{ text: p.name, font: fonts.bold, size: 10.2 }];
          if (p.link) {
            segs.push({ text: "  |  ", font: fonts.regular, size: 9, color: RULE });
            segs.push({ text: displayUrl(p.link), font: fonts.regular, size: 9, color: MUTED, link: p.link });
          }
          leftRight(segs, "");
          w.space(1.5);
          bullets(p.bullets);
          if (p.technologies.length) labeled("Technologies", p.technologies.join(", "));
        });
        break;

      case "education":
        if (!resume.education.length) break;
        heading("Education");
        resume.education.forEach((e, idx) => {
          w.ensure(13.6 * 3);
          if (idx) w.space(6);
          const years = [e.startYear, e.endYear].filter(Boolean).join(" – ");
          leftRight([{ text: e.degree || e.institution, font: fonts.bold, size: 10.2 }], years);
          const sub = [e.degree ? e.institution : "", e.location].filter(Boolean).join("  •  ");
          if (sub) {
            w.y -= 12.4 * k;
            w.draw(sub, w.left, fonts.italic, 9.6, MUTED);
          }
          if (e.grade) {
            w.y -= 12.4 * k;
            w.draw(e.grade, w.left, fonts.regular, 9.4, INK);
          }
          if (e.coursework) labeled("Relevant coursework", e.coursework);
        });
        break;

      case "certifications":
        if (!resume.certifications.length) break;
        heading("Certifications");
        w.space(1);
        for (const cert of resume.certifications) {
          const meta = [cert.issuer, cert.date ? formatDate(cert.date) : "", cert.credentialId ? `Credential ID ${cert.credentialId}` : ""].filter(Boolean).join(", ");
          const segs: Seg[] = [{ text: cert.name, font: fonts.bold, size: BODY, link: cert.url || undefined }];
          if (meta) segs.push({ text: ` — ${meta}`, font: fonts.regular, size: BODY });
          w.paragraph(segs, { lineHeight: LH });
        }
        break;

      case "achievements":
        if (!resume.achievements.length) break;
        heading("Achievements");
        w.space(1);
        bullets(resume.achievements);
        break;

      case "additional":
        for (const s of resume.additional) {
          if (!s.items.length) continue;
          heading(s.title);
          w.space(1);
          if (s.title === "Languages" || s.title === "Interests") {
            w.paragraph([{ text: s.items.join(", "), font: fonts.regular, size: BODY }], { lineHeight: LH });
          } else bullets(s.items);
        }
        break;
    }
  }

  const name = sanitize(c.fullName) || "Resume";
  doc.setTitle(`${name} - Resume`);
  doc.setAuthor(name);
  doc.setSubject(c.title ? `Resume - ${sanitize(c.title)}` : "Resume");
  doc.setCreator("TailorCV");
  doc.setProducer("TailorCV");
  doc.setLanguage("en");
  doc.setCreationDate(new Date());
  const lastUsed = (w.top - w.y) / (w.top - w.bottom);
  const bytes = await doc.save();
  return { bytes, pageCount: w.pages.length, lastPageSparse: w.pages.length > 1 && lastUsed < 0.18 };
}

