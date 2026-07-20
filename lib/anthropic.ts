import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

/**
 * Server-only Anthropic client. Never import into a client bundle (§8.2).
 * Models come from env — never hardcode model IDs (§3, standing instruction).
 */
let _client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: env.anthropicKey() });
  return _client;
}

/** Model tiers. ANSWER = drafting; FAST = detect / rerank / verify. */
export const MODELS = {
  // Sensible current defaults; override via env when tiers change.
  answer: () => env.answerModel() || "claude-sonnet-4-5",
  fast: () => env.fastModel() || "claude-haiku-4-5",
};

/**
 * Call a model and force a single JSON object out of it.
 * We instruct JSON in the prompt AND parse defensively (strip code fences,
 * grab the first {...} block) so a stray word never crashes the pipeline.
 */
export async function askJSON<T>(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ data: T; usage: { input: number; output: number } }> {
  const res = await anthropic().messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const data = parseJsonLoose<T>(text);
  return {
    data,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
  };
}

/** Best-effort JSON extraction: handles ```json fences and leading prose. */
export function parseJsonLoose<T>(text: string): T {
  let t = text.trim();
  // strip code fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // if there is surrounding prose, grab the outermost brace block
  if (!t.startsWith("{") && !t.startsWith("[")) {
    const first = t.indexOf("{");
    const last = t.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) t = t.slice(first, last + 1);
  }
  return JSON.parse(t) as T;
}
