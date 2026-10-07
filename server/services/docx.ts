/** ATS-safe DOCX export (single column, real Word bullets, tab-aligned dates, Calibri). */
import { Document, Packer, Paragraph, TextRun, TabStopType, AlignmentType, BorderStyle, ExternalHyperlink, LevelFormat } from "docx";
import type { Resume, PageSize } from "../../shared/types";
import { formatDate, formatRange } from "../../shared/dates";

const NAVY = "1B3A63";
const MUTED = "4A5466";
const FONT = "Calibri";

function url(u: string): string {
  return /^(https?:|mailto:)/i.test(u) ? u : `https://${u}`;
}
function displayUrl(u: string): string {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export async function renderResumeDocx(r: Resume, pageSize: PageSize = "A4"): Promise<Buffer> {
  const pageW = pageSize === "A4" ? 11906 : 12240; // twips
  const pageH = pageSize === "A4" ? 16838 : 15840;
  const margin = 1000;
  const rightTab = pageW - margin * 2;
  const children: Paragraph[] = [];
  const c = r.contact;

  children.push(new Paragraph({ children: [new TextRun({ text: c.fullName || "Your Name", bold: true, size: 40, font: FONT })], spacing: { after: 40 } }));
  if (c.title) children.push(new Paragraph({ children: [new TextRun({ text: c.title, size: 23, color: NAVY, font: FONT })], spacing: { after: 60 } }));
  const bits: (TextRun | ExternalHyperlink)[] = [];
  const sep = () => bits.length && bits.push(new TextRun({ text: "  |  ", size: 18, color: "A0AABB", font: FONT }));
  const add = (text: string, link?: string) => {
    if (!text) return;
    sep();
    const run = new TextRun({ text, size: 18, color: MUTED, font: FONT });
    bits.push(link ? new ExternalHyperlink({ link, children: [run] }) : run);
  };
  add(c.email, c.email ? `mailto:${c.email}` : undefined);
  add(c.phone);
  add(c.location);
  for (const u of [c.linkedin, c.github, c.portfolio, ...c.otherLinks]) if (u) add(displayUrl(u), url(u));
  if (bits.length) children.push(new Paragraph({ children: bits, spacing: { after: 120 } }));

  const heading = (t: string) =>
    children.push(
      new Paragraph({
        children: [new TextRun({ text: t.toUpperCase(), bold: true, size: 21, color: NAVY, font: FONT, characterSpacing: 16 })],
        spacing: { before: 240, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "B8C4D6", space: 2 } },
        keepNext: true,
      }),
    );
  const bullet = (t: string) =>
    children.push(new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text: t, size: 20, font: FONT })], spacing: { after: 30 } }));
  const leftRight = (left: string, right: string, size = 21) =>
    children.push(
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: rightTab }],
        keepNext: true,
        spacing: { before: 120, after: 10 },
        children: [new TextRun({ text: left, bold: true, size, font: FONT }), ...(right ? [new TextRun({ text: `\t${right}`, size: 19, color: MUTED, font: FONT })] : [])],
      }),
    );
  const sub = (t: string) => t && children.push(new Paragraph({ keepNext: true, spacing: { after: 40 }, children: [new TextRun({ text: t, italics: true, size: 19, color: MUTED, font: FONT })] }));
  const labeled = (label: string, value: string) =>
    children.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: `${label}: `, bold: true, size: 19, font: FONT }), new TextRun({ text: value, size: 19, font: FONT })] }));

  for (const key of r.sectionOrder) {
    switch (key) {
      case "summary":
        if (!r.summary) break;
        heading("Summary");
        children.push(new Paragraph({ children: [new TextRun({ text: r.summary, size: 20, font: FONT })] }));
        break;
      case "skills":
        if (!r.skills.length) break;
        heading("Skills");
        for (const g of r.skills) labeled(g.category, g.items.join(", "));
        break;
      case "experience":
        if (!r.experience.length) break;
        heading("Experience");
        for (const e of r.experience) {
          leftRight(e.title || e.company, formatRange(e.startDate, e.endDate, e.current));
          sub([e.title ? e.company : "", e.location].filter(Boolean).join("  •  "));
          e.bullets.forEach(bullet);
          if (e.technologies.length) labeled("Technologies", e.technologies.join(", "));
        }
        break;
      case "projects":
        if (!r.projects.length) break;
        heading("Projects");
        for (const p of r.projects) {
          children.push(
            new Paragraph({
              spacing: { before: 120, after: 20 },
              keepNext: true,
              children: [
                new TextRun({ text: p.name, bold: true, size: 21, font: FONT }),
                ...(p.link ? [new TextRun({ text: "  |  ", size: 18, color: "A0AABB", font: FONT }), new ExternalHyperlink({ link: url(p.link), children: [new TextRun({ text: displayUrl(p.link), size: 18, color: MUTED, font: FONT })] })] : []),
              ],
            }),
          );
          p.bullets.forEach(bullet);
          if (p.technologies.length) labeled("Technologies", p.technologies.join(", "));
        }
        break;
      case "education":
        if (!r.education.length) break;
        heading("Education");
        for (const e of r.education) {
          leftRight(e.degree || e.institution, [e.startYear, e.endYear].filter(Boolean).join(" – "));
          sub([e.degree ? e.institution : "", e.location].filter(Boolean).join("  •  "));
          if (e.grade) children.push(new Paragraph({ children: [new TextRun({ text: e.grade, size: 19, font: FONT })] }));
          if (e.coursework) labeled("Relevant coursework", e.coursework);
        }
        break;
      case "certifications":
        if (!r.certifications.length) break;
        heading("Certifications");
        for (const x of r.certifications) {
          const meta = [x.issuer, x.date ? formatDate(x.date) : "", x.credentialId ? `Credential ID ${x.credentialId}` : ""].filter(Boolean).join(", ");
          children.push(new Paragraph({ spacing: { after: 30 }, children: [new TextRun({ text: x.name, bold: true, size: 20, font: FONT }), ...(meta ? [new TextRun({ text: ` — ${meta}`, size: 20, font: FONT })] : [])] }));
        }
        break;
      case "achievements":
        if (!r.achievements.length) break;
        heading("Achievements");
        r.achievements.forEach(bullet);
        break;
      case "additional":
        for (const s of r.additional) {
          if (!s.items.length) continue;
          heading(s.title);
          if (s.title === "Languages" || s.title === "Interests") children.push(new Paragraph({ children: [new TextRun({ text: s.items.join(", "), size: 20, font: FONT })] }));
          else s.items.forEach(bullet);
        }
        break;
    }
  }

  const doc = new Document({
    creator: "TailorCV",
    title: `${c.fullName || "Resume"} - Resume`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    numbering: {
      config: [
        {
          reference: "bullets",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 220 } } } }],
        },
      ],
    },
    sections: [{ properties: { page: { size: { width: pageW, height: pageH }, margin: { top: 900, bottom: 900, left: margin, right: margin } } }, children }],
  });
  return Packer.toBuffer(doc);
}
