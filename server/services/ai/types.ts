/**
 * AI service abstraction. The pipeline only talks to this interface, so providers can be swapped.
 * Every AI result is re-validated by the fabrication guard before it reaches the resume.
 */
import type { ProfileInput, JdAnalysis } from "../../../shared/types";

export interface AiBullet {
  text: string;
  sources: number[]; // indexes into the source bullets it rewrites
}

export interface AiOptimization {
  summary: string;
  experience: { id: string; bullets: AiBullet[] }[];
  projects: { id: string; bullets: AiBullet[] }[];
}

export interface OptimizeInput {
  jd: JdAnalysis;
  jdText: string;
  profile: ProfileInput;
  /** Source bullets per role/project as the model will see them (index-aligned with AiBullet.sources). */
  experienceSources: { id: string; title: string; company: string; current: boolean; bullets: string[]; technologies: string[] }[];
  projectSources: { id: string; name: string; bullets: string[]; technologies: string[] }[];
  skills: string[];
  yearsOfExperience: number;
}

export interface AiProvider {
  readonly name: string;
  optimize(input: OptimizeInput, signal?: AbortSignal): Promise<AiOptimization>;
  summarize(input: OptimizeInput, signal?: AbortSignal): Promise<string>;
  extractResume(text: string, signal?: AbortSignal): Promise<unknown>;
}

export class AiUnavailableError extends Error {
  constructor(
    message: string,
    public reason: "timeout" | "http" | "invalid_response" | "not_configured" | "network",
  ) {
    super(message);
    this.name = "AiUnavailableError";
  }
}
