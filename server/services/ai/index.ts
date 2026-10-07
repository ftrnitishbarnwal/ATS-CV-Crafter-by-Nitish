import { env, aiEnabled } from "../../env";
import type { AiProvider, AiOptimization, OptimizeInput } from "./types";
import { AiUnavailableError } from "./types";
import { AnthropicProvider } from "./anthropic";
import { strengthenOpening } from "../../../shared/verbs";

/**
 * Test doubles, selectable with AI_PROVIDER=mock | fail (never used in production by default).
 * - mock: behaves like a model, including one deliberately fabricated claim so the guard can be verified.
 * - fail: always errors, to verify graceful fallback to the local engine.
 */
class MockProvider implements AiProvider {
  readonly name = "mock";
  async optimize(input: OptimizeInput): Promise<AiOptimization> {
    let injected = false;
    return {
      summary: `${input.profile.contact.title || "Professional"} with ${Math.floor(input.yearsOfExperience)}+ years of experience delivering results with ${input.skills.slice(0, 3).join(", ")}.`,
      experience: input.experienceSources.map((e) => ({
        id: e.id,
        bullets: e.bullets.map((b, i) => {
          let text = strengthenOpening(b, "past").text;
          if (!injected) {
            // Fabricated metric + tool the user never mentioned: must be rejected by the guard.
            text = `${text}, increasing revenue by 300% using Snowflake`;
            injected = true;
          }
          return { text, sources: [i] };
        }),
      })),
      projects: input.projectSources.map((p) => ({ id: p.id, bullets: p.bullets.map((b, i) => ({ text: strengthenOpening(b, "past").text, sources: [i] })) })),
    };
  }
  async summarize(input: OptimizeInput): Promise<string> {
    return `${input.profile.contact.title || "Professional"} experienced in ${input.skills.slice(0, 4).join(", ")}.`;
  }
  async extractResume(): Promise<unknown> {
    throw new AiUnavailableError("mock does not extract", "not_configured");
  }
}

class FailingProvider implements AiProvider {
  readonly name = "fail";
  async optimize(): Promise<AiOptimization> {
    throw new AiUnavailableError("simulated outage", "http");
  }
  async summarize(): Promise<string> {
    throw new AiUnavailableError("simulated outage", "http");
  }
  async extractResume(): Promise<unknown> {
    throw new AiUnavailableError("simulated outage", "http");
  }
}

let cached: AiProvider | null | undefined;

export function getAiProvider(): AiProvider | null {
  if (cached !== undefined) return cached;
  const p = process.env.AI_PROVIDER?.toLowerCase();
  if (p === "mock") cached = new MockProvider();
  else if (p === "fail") cached = new FailingProvider();
  else if (aiEnabled()) cached = new AnthropicProvider();
  else cached = null;
  return cached;
}

export function aiStatus(): { mode: "ai" | "local"; provider: string } {
  const p = getAiProvider();
  return p ? { mode: "ai", provider: p.name === "anthropic" ? `anthropic:${env.anthropicModel}` : p.name } : { mode: "local", provider: "local" };
}
