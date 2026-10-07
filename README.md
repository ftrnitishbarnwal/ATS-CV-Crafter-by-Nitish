# ATS CV Crafter — AI-Powered Resume Builder

> **A free, open-source ATS-friendly resume builder** that creates professional, job-specific resumes based on your profile and target Job Description.

ATS CV Crafter takes a target job description plus your real experience and generates a tailored, ATS-optimized resume you can edit and download as **PDF** or **Word (DOCX)**.

---

## ✨ Key Features

- **Job-Description Matching** — Paste a job description and get a resume tailored to it, with keyword coverage, skill alignment, and relevance ordering.
- **Multiple Input Methods** — Upload an existing resume (PDF / DOCX / TXT) *or* fill out a guided multi-step form.
- **AI-Powered Rewriting** — Uses Claude (Anthropic) for intelligent rewriting and extraction; falls back to a robust built-in rules engine when no API key is set.
- **ATS Optimization Score** — An 8-component, 100-point score showing keyword coverage, skills alignment, job-title match, experience relevance, impact verbs, section completeness, contact info, and formatting.
- **Truthfulness Enforced** — Companies, titles, dates, degrees, and certifications are never fabricated. Skills are only listed if evidenced in your own material. Every AI-written sentence is verified by a fabrication guard.
- **Live Preview & Editor** — Preview your resume in real time, edit any section, recalculate your ATS score, and download when satisfied.
- **PDF & DOCX Export** — Download as `FirstName_LastName_Resume.pdf` or `.docx`.
- **Privacy-First** — Uploaded files are processed in memory and discarded. Nothing is written to disk or a database. The draft lives in your browser's `sessionStorage` and is cleared when the tab closes.
- **Docker Support** — Ship with a single `docker build` and `docker run`.

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/ftrnitishbarnwal/ATS-CV-Crafter-by-Nitish.git
cd ATS-CV-Crafter-by-Nitish

# 2. Install dependencies
npm install

# 3. (Optional) Configure AI rewriting
cp .env.example .env
# Add your ANTHROPIC_API_KEY in .env for AI-powered rewriting

# 4. Build & start
npm run build
npm start
# → http://localhost:3000
```

> **Requires Node.js 20+.**  
> Without an API key the app runs fully on its built-in rules engine; with a key it uses Claude for rewriting and extraction, with every AI claim verified against the user's own information.

---

## 📋 Available Commands

| Command | Description |
| --- | --- |
| `npm run build` | Bundles the React client (hashed assets) and the Node server into `dist/` |
| `npm start` | Runs the production server (`dist/server.mjs`) |
| `npm run dev` | Rebuilds the client on change and runs the server with auto-reload |
| `npm test` | Unit and integration tests (engine, parsers, PDF/DOCX, Anthropic integration) |
| `npm run test:e2e` | Browser end-to-end tests with Playwright (`npx playwright install chromium` once) |
| `npm run typecheck` | TypeScript type check |

### Docker

```bash
docker build -t ats-cv-crafter .
docker run -p 3000:3000 --env-file .env ats-cv-crafter
```

---

## ⚙️ Environment Variables

All environment variables are **optional**. See [`.env.example`](.env.example) for the full template.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | Server bind address |
| `AI_PROVIDER` | `auto` | `auto` (Anthropic if key set), `anthropic`, or `local` (no external AI) |
| `ANTHROPIC_API_KEY` | — | Server-side only; never sent to the browser |
| `ANTHROPIC_MODEL` | `claude-sonnet-5-5` | Model used for rewriting and extraction |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Override for an approved gateway |
| `AI_TIMEOUT_MS` | `60000` | Timeout before fallback to rules engine |
| `RATE_LIMIT_PER_MINUTE` | `60` | General per-IP request limit |
| `AI_RATE_LIMIT_PER_MINUTE` | `8` | AI-endpoint per-IP request limit |
| `TRUST_PROXY` | `false` | Set `true` behind a load balancer for accurate IP-based limits |

---

## 🏗️ Architecture

```
client/                React 19 + TypeScript UI (bundled with esbuild)
  pages/               Landing, Builder shell
  components/          JD step, upload/review, multi-step form, processing, result, score panel, editor, PDF preview
  lib/                 API client (streamed progress), session store, router
  styles/              Design system (IBM Plex Serif + Instrument Sans, navy/ledger-blue palette)
shared/                Isomorphic engine (server + client)
  types.ts             Resume data model
  jd-analyzer.ts       JD parsing: title, skills, tools, domain terms, years, education, action verbs
  resume-parser.ts     Resume text → structured profile
  skills-dictionary.ts ~550 skills & tools (~800 spellings) with collision-safe matching
  optimizer.ts         Deterministic tailoring: verbs, terminology, relevance ordering, evidence-based skills
  scoring.ts           ATS score (8 components = 100 pts) + insights
  guard.ts             Fabrication guard for AI output
  validation.ts        Shared input validation
server/
  index.ts             HTTP server, routes, static files, security headers, rate limiting
  services/extract.ts  PDF (pdf.js, two-column), DOCX, TXT extraction
  services/ai/         Provider interface, Anthropic Messages API, test doubles
  services/pipeline.ts Generation pipeline with stage-by-stage progress
  services/pdf.ts      ATS-safe PDF renderer (pdf-lib, Helvetica, pagination, links)
  services/docx.ts     Word export
tests/                 Unit, E2E, and fixtures
scripts/               Build tooling (esbuild)
```

### API Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Reports whether AI or the local engine is active |
| `POST` | `/api/jd` | Analyze a job description |
| `POST` | `/api/parse` | Parse an uploaded resume file → structured profile |
| `POST` | `/api/analyze` | Baseline ATS score for uploaded resume |
| `POST` | `/api/generate` | NDJSON stream of generation stages → tailored resume |
| `POST` | `/api/score` | Recalculate ATS score after edits |
| `POST` | `/api/summary` | AI-drafted professional summary |
| `POST` | `/api/export/pdf` | Download as PDF |
| `POST` | `/api/export/docx` | Download as DOCX |

---

## 🔒 How Truthfulness Is Enforced

1. **Facts are preserved** — Companies, titles, dates, degrees, and certifications are copied from the user's data; only wording, order, and summary are touched.
2. **Skills are evidence-based** — A JD skill is only added to the Skills section if the user's own bullets, technologies, or projects already mention it. Missing skills are *reported*, never inserted.
3. **AI output is guarded** — Every AI-written sentence passes the fabrication guard: numbers must already exist in the source material, known skills/tools must be evidenced, new proper nouns are rejected, and inflated rewrites are blocked. Rejected lines fall back to the user's own content.
4. **Extraction is grounded** — AI-extracted resume data is verified against the uploaded text; anything not present in the file is dropped.

---

## 🐳 Known Limitations

- PDF export uses standard Helvetica, so characters outside Western European Latin (e.g. Devanagari, CJK) are transliterated or omitted; `₹` is written as `INR`.
- Scanned / image-only PDFs aren't OCR'd; users are asked for a text PDF, DOCX, or to use the form.
- Legacy `.doc` files aren't supported (save as DOCX or PDF).
- Rate limiting is in-memory per instance; use a shared store (e.g. Redis) for multi-instance deployments.
- The rules engine's rewriting is deliberately conservative; the richest rewriting requires an Anthropic API key.

---

## 📄 License

This project is open-source. Feel free to fork, modify, and contribute!

---

**Built with ❤️ by Nitish**
