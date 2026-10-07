/**
 * Anthropic (Claude) provider using the Messages API over fetch, with forced tool use
 * for structured JSON output. The API key is read server-side only.
 */
import { env } from "../../env";
import type { AiProvider, AiOptimization, OptimizeInput } from "./types";
import { AiUnavailableError } from "./types";

const RULES = `Hard rules — follow all of them:
- Use ONLY facts present in the candidate's material. Never invent or assume companies, job titles, dates, degrees, certifications, metrics, numbers, percentages, team sizes, tools, technologies, responsibilities or achievements.
- Never add a skill or tool just because the job description mentions it. A job keyword may appear only if the candidate's own text shows they used it.
- Keep every number exactly as the candidate wrote it. If a bullet has no number, do not add one.
- You may: rephrase for clarity and impact, start with a strong accurate action verb, use past tense for achievements, remove filler ("responsible for", "worked on", "helped"), merge duplicate bullets, and use the job's wording for things the candidate genuinely did.
- No first-person pronouns, no clichés ("results-driven", "team player", "go-getter"), no keyword stuffing.
- Bullets: one line of 12–28 words where the source allows; never longer than 35 words.`;

const OPTIMIZE_TOOL = {
  name: "submit_optimized_resume",
  description: "Submit the rewritten summary and bullets.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "2–4 sentence professional summary, 40–75 words, grounded only in the candidate's material." },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            bullets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  sources: { type: "array", items: { type: "integer" }, description: "Indexes of the source bullets this bullet is based on." },
                },
                required: ["text", "sources"],
              },
            },
          },
          required: ["id", "bullets"],
        },
      },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            bullets: {
              type: "array",
              items: {
                type: "object",
                properties: { text: { type: "string" }, sources: { type: "array", items: { type: "integer" } } },
                required: ["text", "sources"],
              },
            },
          },
          required: ["id", "bullets"],
        },
      },
    },
    required: ["summary", "experience", "projects"],
  },
};

const SUMMARY_TOOL = {
  name: "submit_summary",
  description: "Submit the professional summary.",
  input_schema: { type: "object", properties: { summary: { type: "string" } }, required: ["summary"] },
};

const EXTRACT_TOOL = {
  name: "submit_resume_data",
  description: "Submit the structured resume data extracted from the text.",
  input_schema: {
    type: "object",
    properties: {
      contact: {
        type: "object",
        properties: {
          fullName: { type: "string" }, title: { type: "string" }, email: { type: "string" }, phone: { type: "string" },
          location: { type: "string" }, linkedin: { type: "string" }, github: { type: "string" }, portfolio: { type: "string" },
          otherLinks: { type: "array", items: { type: "string" } },
        },
      },
      summary: { type: "string" },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            company: { type: "string" }, title: { type: "string" }, location: { type: "string" },
            startDate: { type: "string", description: "YYYY-MM or YYYY exactly as supported by the text, else empty" },
            endDate: { type: "string", description: "YYYY-MM or YYYY, empty if current" },
            current: { type: "boolean" },
            bullets: { type: "array", items: { type: "string" }, description: "Bullet text copied verbatim" },
            technologies: { type: "array", items: { type: "string" } },
          },
        },
      },
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" }, institution: { type: "string" }, location: { type: "string" },
            startYear: { type: "string" }, endYear: { type: "string" }, grade: { type: "string" }, coursework: { type: "string" },
          },
        },
      },
      skills: { type: "array", items: { type: "object", properties: { category: { type: "string" }, items: { type: "array", items: { type: "string" } } } } },
      projects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" }, description: { type: "string" }, technologies: { type: "array", items: { type: "string" } },
            bullets: { type: "array", items: { type: "string" } }, link: { type: "string" },
          },
        },
      },
      certifications: {
        type: "array",
        items: { type: "object", properties: { name: { type: "string" }, issuer: { type: "string" }, date: { type: "string" }, credentialId: { type: "string" }, url: { type: "string" } } },
      },
      achievements: { type: "array", items: { type: "string" } },
      languages: { type: "array", items: { type: "string" } },
      volunteer: { type: "array", items: { type: "string" } },
      publications: { type: "array", items: { type: "string" } },
      conferences: { type: "array", items: { type: "string" } },
      memberships: { type: "array", items: { type: "string" } },
      interests: { type: "array", items: { type: "string" } },
    },
    required: ["contact", "experience", "education", "skills"],
  },
};

interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

async function callTool<T>(system: string, user: string, tool: ToolDef, maxTokens: number, signal?: AbortSignal): Promise<T> {
  if (!env.anthropicApiKey) throw new AiUnavailableError("AI is not configured", "not_configured");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), env.aiTimeoutMs);
  signal?.addEventListener("abort", () => ctrl.abort(), { once: true });
  let res: Response;
  try {
    res = await fetch(`${env.anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
        tools: [tool],
        tool_choice: { type: "tool", name: tool.name },
      }),
    });
  } catch (e) {
    clearTimeout(timer);
    if ((e as Error).name === "AbortError") throw new AiUnavailableError("AI request timed out", "timeout");
    throw new AiUnavailableError("AI request failed", "network");
  }
  clearTimeout(timer);
  if (!res.ok) {
    // Drain body without logging it (it can echo request content).
    await res.text().catch(() => "");
    throw new AiUnavailableError(`AI HTTP ${res.status}`, "http");
  }
  const data = (await res.json().catch(() => null)) as { content?: { type: string; name?: string; input?: unknown }[] } | null;
  const block = data?.content?.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!block || typeof block.input !== "object" || block.input === null) throw new AiUnavailableError("AI returned no structured output", "invalid_response");
  return block.input as T;
}

function jdBrief(i: OptimizeInput) {
  return {
    title: i.jd.title,
    required_skills: i.jd.requiredSkills,
    preferred_skills: i.jd.preferredSkills,
    domain_terms: i.jd.domainTerms,
    key_responsibilities: i.jd.responsibilities.slice(0, 10),
    action_verbs: i.jd.actionVerbs,
    min_years: i.jd.minYears,
  };
}

function candidateBrief(i: OptimizeInput) {
  return {
    headline: i.profile.contact.title,
    existing_summary: i.profile.autoSummary ? "" : i.profile.summary,
    years_of_experience: i.yearsOfExperience,
    skills: i.skills,
    experience: i.experienceSources.map((e) => ({
      id: e.id, title: e.title, company: e.company, current: e.current, technologies: e.technologies,
      source_bullets: e.bullets.map((b, idx) => ({ index: idx, text: b })),
    })),
    projects: i.projectSources.map((p) => ({ id: p.id, name: p.name, technologies: p.technologies, source_bullets: p.bullets.map((b, idx) => ({ index: idx, text: b })) })),
    education: i.profile.education.map((e) => ({ degree: e.degree, institution: e.institution })),
    certifications: i.profile.certifications.map((c) => c.name),
  };
}

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  async optimize(input: OptimizeInput, signal?: AbortSignal): Promise<AiOptimization> {
    const system = `You are a senior resume writer and ATS specialist. You tailor a candidate's resume to a target job by rewriting their existing bullet points and summary.\n\n${RULES}\n\nOrder each role's bullets so the ones most relevant to the target job come first. Return every role and project id you were given.`;
    const user = `TARGET JOB (analysis):\n${JSON.stringify(jdBrief(input))}\n\nTARGET JOB (original text, for terminology only):\n"""${input.jdText.slice(0, 12000)}"""\n\nCANDIDATE MATERIAL (the only allowed source of facts):\n${JSON.stringify(candidateBrief(input))}\n\nRewrite the summary${input.profile.autoSummary || !input.profile.summary ? " (write a new one)" : " (improve the existing one)"} and every source bullet. Call ${OPTIMIZE_TOOL.name}.`;
    const out = await callTool<AiOptimization>(system, user, OPTIMIZE_TOOL, 4000, signal);
    if (!out || typeof out.summary !== "string" || !Array.isArray(out.experience) || !Array.isArray(out.projects)) {
      throw new AiUnavailableError("AI output shape invalid", "invalid_response");
    }
    return out;
  }

  async summarize(input: OptimizeInput, signal?: AbortSignal): Promise<string> {
    const system = `You write concise professional resume summaries tailored to a target job.\n\n${RULES}`;
    const user = `TARGET JOB:\n${JSON.stringify(jdBrief(input))}\n\nCANDIDATE MATERIAL:\n${JSON.stringify(candidateBrief(input))}\n\nWrite a 2–4 sentence summary (40–75 words). Call ${SUMMARY_TOOL.name}.`;
    const out = await callTool<{ summary: string }>(system, user, SUMMARY_TOOL, 600, signal);
    if (typeof out?.summary !== "string") throw new AiUnavailableError("AI output shape invalid", "invalid_response");
    return out.summary;
  }

  async extractResume(text: string, signal?: AbortSignal): Promise<unknown> {
    const system = `You convert resume text into structured data. Copy text verbatim — do not rewrite, summarize, correct or add anything. Leave fields empty when the text doesn't state them. Dates: convert to YYYY-MM or YYYY only when the text states them.`;
    const user = `RESUME TEXT:\n"""${text.slice(0, 30000)}"""\n\nCall ${EXTRACT_TOOL.name}.`;
    return callTool<unknown>(system, user, EXTRACT_TOOL, 6000, signal);
  }
}
