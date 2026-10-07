/** Action verbs and conservative verb transformations for bullet rewriting. */

// base form -> past tense (only verbs listed here are ever transformed)
const IRREGULAR: Record<string, string> = {
  build: "built", lead: "led", run: "ran", write: "wrote", drive: "drove", grow: "grew", make: "made", teach: "taught",
  oversee: "oversaw", undertake: "undertook", spearhead: "spearheaded", win: "won", sell: "sold", hold: "held", set: "set",
  cut: "cut", find: "found", give: "gave", take: "took", bring: "brought", begin: "began", keep: "kept", meet: "met",
  speak: "spoke", think: "thought", feed: "fed", deal: "dealt", mean: "meant", send: "sent", spend: "spent", draw: "drew",
  rebuild: "rebuilt", rewrite: "rewrote", overhaul: "overhauled", understand: "understood", uphold: "upheld", foresee: "foresaw",
};

const REGULAR = [
  "accelerate", "achieve", "administer", "advise", "advocate", "align", "analyze", "analyse", "architect", "arrange", "assemble",
  "assess", "audit", "author", "automate", "balance", "benchmark", "boost", "budget", "calculate", "campaign", "champion", "clarify",
  "coach", "collaborate", "compile", "complete", "conceptualize", "conduct", "configure", "consolidate", "construct", "consult",
  "contribute", "control", "convert", "coordinate", "create", "curate", "customize", "debug", "decrease", "define", "deliver",
  "deploy", "design", "detect", "develop", "devise", "diagnose", "direct", "document", "double", "draft", "streamline", "educate",
  "eliminate", "enable", "engineer", "enhance", "ensure", "establish", "estimate", "evaluate", "examine", "execute", "expand",
  "expedite", "facilitate", "finalize", "forecast", "formulate", "generate", "guide", "handle", "identify", "implement", "improve",
  "increase", "influence", "initiate", "innovate", "inspect", "install", "instruct", "integrate", "interview", "introduce",
  "investigate", "launch", "maintain", "manage", "market", "maximize", "measure", "mentor", "merge", "migrate", "minimize",
  "model", "modernize", "monitor", "motivate", "negotiate", "optimize", "orchestrate", "organize", "outperform", "own", "partner",
  "perform", "pilot", "pioneer", "plan", "prepare", "present", "prioritize", "process", "produce", "program", "promote", "propose",
  "prototype", "provide", "publish", "raise", "recommend", "reconcile", "recruit", "redesign", "reduce", "refactor", "refine",
  "regulate", "release", "remediate", "reorganize", "report", "research", "resolve", "restructure", "review", "revamp", "save",
  "scale", "schedule", "secure", "serve", "ship", "simplify", "solve", "source", "standardize", "structure", "supervise",
  "support", "survey", "sustain", "test", "track", "train", "transform", "translate", "triage", "troubleshoot", "update",
  "upgrade", "validate", "verify", "visualize", "volunteer", "handle", "operate", "offer", "answer", "assist", "help", "work",
  "participate", "involve", "deliver", "close", "acquire", "onboard", "prospect", "qualify", "upsell", "forge", "cultivate",
  "attain", "surpass", "exceed", "exceled", "fix", "tune", "adopt", "extend", "resolve", "respond", "handle", "gather", "collect",
  "compose", "edit", "proofread", "illustrate", "photograph", "film", "record", "tutor", "grade", "counsel", "treat", "administer",
  "care", "examine", "file", "invoice", "clean", "model", "map", "draft", "shape", "craft", "book", "audit", "restore", "install", "repair", "inspect", "demonstrate", "persuade",
  "moderate", "host", "organise", "optimise", "analyse", "prioritise", "standardise", "utilize", "use", "leverage", "establish",
];

const BASE_TO_PAST = new Map<string, string>();
for (const [b, p] of Object.entries(IRREGULAR)) BASE_TO_PAST.set(b, p);
for (const b of REGULAR) {
  if (BASE_TO_PAST.has(b)) continue;
  let past: string;
  if (b.endsWith("e")) past = b + "d";
  else if (/[^aeiou]y$/.test(b)) past = b.slice(0, -1) + "ied";
  else if (/^(plan|ship|scrap|drop|stop|audit)$/.test(b)) past = b === "audit" ? "audited" : b + b.slice(-1) + "ed";
  else past = b + "ed";
  BASE_TO_PAST.set(b, past);
}
BASE_TO_PAST.set("program", "programmed");
BASE_TO_PAST.set("model", "modeled");
BASE_TO_PAST.set("travel", "traveled");
BASE_TO_PAST.set("exceled", "excelled");
BASE_TO_PAST.set("control", "controlled");

const PAST_SET = new Set(BASE_TO_PAST.values());
const PAST_TO_BASE = new Map<string, string>();
for (const [b, p] of BASE_TO_PAST) PAST_TO_BASE.set(p, b);

/** third person "manages" -> "manage" */
function thirdToBase(w: string): string | null {
  if (BASE_TO_PAST.has(w)) return null;
  const candidates = [w.replace(/ies$/, "y"), w.replace(/es$/, ""), w.replace(/s$/, "")];
  for (const c of candidates) if (c !== w && BASE_TO_PAST.has(c)) return c;
  return null;
}

/** gerund "managing" -> "manage" */
export function gerundToBase(w: string): string | null {
  const lw = w.toLowerCase();
  if (!lw.endsWith("ing")) return null;
  const stem = lw.slice(0, -3);
  const candidates = [stem, stem + "e", stem.replace(/(.)\1$/, "$1")];
  for (const c of candidates) if (BASE_TO_PAST.has(c)) return c;
  return null;
}

export function toPast(base: string): string {
  return BASE_TO_PAST.get(base.toLowerCase()) ?? base;
}

export function isKnownVerb(word: string): boolean {
  const w = word.toLowerCase();
  return BASE_TO_PAST.has(w) || PAST_SET.has(w) || gerundToBase(w) != null || thirdToBase(w) != null;
}

/** Weak openers ATS reviewers and recruiters flag. */
export const WEAK_STARTERS = [
  /^(?:i\s+)?(?:was|were|am|is)\s+responsible\s+for\b/i,
  /^responsible\s+for\b/i,
  /^responsibilities\s+(?:included|include)\b/i,
  /^duties\s+(?:included|include)\b/i,
  /^tasked\s+with\b/i,
  /^worked\s+on\b/i,
  /^working\s+on\b/i,
  /^involved\s+in\b/i,
  /^participated\s+in\b/i,
  /^helped\b/i,
  /^assisted\s+(?:in|with)\b/i,
  /^handled\b/i,
  /^did\b/i,
  /^in\s+charge\s+of\b/i,
];

const WEAK_VERBS = new Set(["helped", "assisted", "worked", "handled", "did", "participated", "involved", "tasked", "responsible", "used", "utilized", "was", "were"]);

export function startsWithStrongVerb(bullet: string): boolean {
  const first = (bullet.trim().split(/\s+/)[0] || "").replace(/[^A-Za-z-]/g, "").toLowerCase();
  if (!first || WEAK_VERBS.has(first)) return false;
  return BASE_TO_PAST.has(first) || PAST_SET.has(first) || thirdToBase(first) != null;
}

const NOMINAL_TO_VERB: Record<string, string> = {
  development: "develop", management: "manage", implementation: "implement", maintenance: "maintain", creation: "create",
  coordination: "coordinate", preparation: "prepare", design: "design", analysis: "analyze", administration: "administer",
  execution: "execute", delivery: "deliver", planning: "plan", testing: "test", supervision: "supervise", oversight: "oversee",
  training: "train", handling: "handle", monitoring: "monitor", optimization: "optimize", automation: "automate", integration: "integrate",
  migration: "migrate", deployment: "deploy", documentation: "document", evaluation: "evaluate", organization: "organize",
  reconciliation: "reconcile", recruitment: "recruit", production: "produce", configuration: "configure", review: "review",
  onboarding: "onboard", reporting: "report", research: "research", tracking: "track", support: "support", resolution: "resolve",
  improvement: "improve", enhancement: "enhance", generation: "generate", scheduling: "schedule", launch: "launch",
};

const OBJECT_START = /^(?:the|a|an|and|all|multiple|several|various|new|key|daily|weekly|monthly|quarterly|annual|cross-functional|end-to-end|over|up|out|with|to|for|on|internal|external|large|high|complex|critical|our|their|client|customer|customers|user|users|stakeholder|stakeholders|teams?|[A-Z0-9$₹€£])/;

export interface VerbRewrite {
  text: string;
  changed: boolean;
}

/**
 * Rewrite the opening of a bullet into a direct action verb, without adding facts.
 * tense: "past" for finished roles, "present" for current roles.
 */
export function strengthenOpening(bulletIn: string, tense: "past" | "present"): VerbRewrite {
  let b = bulletIn.trim().replace(/\s+/g, " ");
  const original = b;
  // Drop first-person subject
  b = b.replace(/^(?:i|we)\s+(?=[a-z])/i, "");
  const verb = (base: string) => (tense === "past" ? toPast(base) : base);

  // "Responsible for managing X" / "Duties included managing X" / "Tasked with managing X"
  const lead = /^(?:(?:was|were|am|is)\s+)?(?:responsible\s+for|responsibilities\s+(?:included|include)|duties\s+(?:included|include)|tasked\s+with|in\s+charge\s+of)\s+(?:the\s+)?/i;
  if (lead.test(b)) {
    const rest = b.replace(lead, "");
    const [w, ...tail] = rest.split(" ");
    const g = gerundToBase(w || "");
    if (g) b = `${verb(g)} ${tail.join(" ")}`;
    else {
      const nm = (w || "").toLowerCase();
      const ofMatch = tail[0]?.toLowerCase() === "of";
      if (NOMINAL_TO_VERB[nm] && ofMatch) b = `${verb(NOMINAL_TO_VERB[nm])} ${tail.slice(1).join(" ")}`;
      else if (NOMINAL_TO_VERB[nm]) b = `${verb("manage")} ${rest}`;
      else b = `${tense === "past" ? "Owned" : "Own"} ${rest}`;
    }
  } else if (/^(?:worked|working)\s+on\s+/i.test(b)) {
    const rest = b.replace(/^(?:worked|working)\s+on\s+/i, "");
    const [w, ...tail] = rest.split(" ");
    const g = gerundToBase(w || "");
    b = g ? `${verb(g)} ${tail.join(" ")}` : `${tense === "past" ? "Contributed" : "Contribute"} to ${rest}`;
  } else if (/^(?:involved|participated)\s+in\s+/i.test(b)) {
    const rest = b.replace(/^(?:involved|participated)\s+in\s+/i, "");
    b = `${tense === "past" ? "Contributed" : "Contribute"} to ${rest}`;
  } else if (/^assisted\s+(?:in|with)\s+/i.test(b)) {
    const rest = b.replace(/^assisted\s+(?:in|with)\s+/i, "");
    b = `${tense === "past" ? "Supported" : "Support"} ${rest}`;
  } else if (/^helped\s+(?:to\s+)?/i.test(b)) {
    const rest = b.replace(/^helped\s+(?:to\s+)?/i, "");
    const [w, ...tail] = rest.split(" ");
    const lw = (w || "").toLowerCase();
    if (BASE_TO_PAST.has(lw) && tail.length && !/^(?:and|or|&)$/i.test(tail[0])) {
      const ing = lw.endsWith("e") && !lw.endsWith("ee") ? lw.slice(0, -1) + "ing" : /^(plan|ship|run|drop|stop)$/.test(lw) ? lw + lw.slice(-1) + "ing" : lw + "ing";
      b = `${tense === "past" ? "Contributed" : "Contribute"} to ${ing} ${tail.join(" ")}`;
    } else if (/ing$/.test(lw) && tail.length) {
      b = `${tense === "past" ? "Contributed" : "Contribute"} to ${rest}`;
    }
    // otherwise leave "Helped …" as written: rewording an unknown verb risks changing the meaning
  } else {
    // Normalize tense of an existing leading verb.
    // Only when the next word clearly begins an object, so noun uses ("Testing framework…") are left alone.
    const [w, ...tail] = b.split(" ");
    const lw = (w || "").toLowerCase().replace(/[^a-z]/g, "");
    const g = gerundToBase(lw);
    if (g && tail.length && OBJECT_START.test(tail[0])) b = `${verb(g)} ${tail.join(" ")}`;
  }

  b = b
    .replace(/\band did (code |design )?reviews\b/i, (_m, k: string | undefined) => `and conducted ${k ?? ""}reviews`)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.;,]+$/, "");
  b = b.charAt(0).toUpperCase() + b.slice(1);
  return { text: b, changed: b !== original.replace(/[.;,]+$/, "").replace(/^./, (c) => c.toUpperCase()) };
}
