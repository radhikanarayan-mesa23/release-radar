// Gemini Flash via REST (JSON mode). ONE batched call per run. Server-side only.
import { z } from 'zod';

const ItemSchema = z.object({
  id: z.string(),
  summary: z.array(z.string()).max(4).default([]),
  is_security: z.boolean().default(false),
  is_breaking: z.boolean().default(false),
  action: z.enum(['upgrade now', 'plan upgrade', 'no action']).default('no action'),
  why: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0.5),
});

const BriefSchema = z.object({
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  text: z.string(),
});

export const GeminiSchema = z.object({
  items: z.array(ItemSchema).default([]),
  briefing: z.array(BriefSchema).default([]),
});

export type GeminiItem = z.infer<typeof ItemSchema>;
export type GeminiBrief = z.infer<typeof BriefSchema>;
export type GeminiOut = z.infer<typeof GeminiSchema>;

export interface GeminiInput {
  id: string; repo: string; category: string; tag: string;
  title: string; body: string; rule_flags: string[];
}

export interface GeminiResult {
  ok: boolean;
  data: GeminiOut;
  input_tokens: number;
  output_tokens: number;
  error?: string;
}

const MAX_BODY = 3000;
const MAX_ITEMS = 40;

const SYSTEM = `You triage open-source RELEASE NOTES for a fintech engineering team.
Their product depends on payment gateways, auth libraries and banking APIs.

For each release decide:
- is_security: does this release fix a vulnerability that could affect a CONSUMER of the package?
- is_breaking: would upgrading require code changes?
- action: "upgrade now" (security or urgent), "plan upgrade" (new features / breaking, schedule it), "no action" (routine).
- summary: exactly 2 bullets, each 18 words or fewer, concrete, no marketing.
- why: 15 words or fewer, why it has that priority.
- confidence: 0..1, how sure you are. Use below 0.6 when the notes are vague or empty.

CRITICAL RULES
1. Dependency bumps in example code, documentation, tests, playgrounds or devDependencies are NOT a security risk for consumers. Set is_security=false for those, even when the notes name a CVE.
2. rule_flags were already decided by code. You may ADD a flag the rules missed. Never argue one away: if rule_flags contains SECURITY, keep is_security true.
3. Judge only the release notes given. Never invent CVEs, versions or features.

Also write a "briefing": 3 to 5 bullets, each 20 words or fewer, naming repos and what to do, ordered HIGH then MEDIUM then LOW.

Return ONLY JSON of this shape:
{"items":[{"id":"","summary":["",""],"is_security":false,"is_breaking":false,"action":"no action","why":"","confidence":0.0}],"briefing":[{"priority":"HIGH","text":""}]}`;

function buildPrompt(items: GeminiInput[]): string {
  const payload = items.map((i) => ({
    id: i.id,
    repo: i.repo,
    category: i.category,
    tag: i.tag,
    title: i.title?.slice(0, 200) ?? '',
    body: (i.body ?? '').slice(0, MAX_BODY),
    rule_flags: i.rule_flags,
  }));
  return `${SYSTEM}\n\nRELEASES (${payload.length}):\n${JSON.stringify(payload)}`;
}

/** Flagged releases first, then newest, capped at 40. */
export function selectForAi<T extends { rule_flags: string[]; published_at?: string | null }>(
  items: T[],
): T[] {
  return [...items]
    .sort((a, b) => {
      const fa = a.rule_flags.length ? 1 : 0;
      const fb = b.rule_flags.length ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return (b.published_at ?? '').localeCompare(a.published_at ?? '');
    })
    .slice(0, MAX_ITEMS);
}

async function callOnce(prompt: string, model: string, key: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 },
      }),
    },
  );
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? `Gemini HTTP ${res.status}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return {
    text,
    input_tokens: json.usageMetadata?.promptTokenCount ?? 0,
    output_tokens: json.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

const EMPTY: GeminiOut = { items: [], briefing: [] };

/** One call (plus at most one retry on an invalid shape). Never throws. */
export async function classify(items: GeminiInput[]): Promise<GeminiResult> {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!key) return { ok: false, data: EMPTY, input_tokens: 0, output_tokens: 0, error: 'GEMINI_API_KEY not set' };
  if (!items.length) return { ok: true, data: EMPTY, input_tokens: 0, output_tokens: 0 };

  const prompt = buildPrompt(items);
  let input_tokens = 0, output_tokens = 0, lastErr = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callOnce(attempt === 0 ? prompt : `${prompt}\n\nReturn valid JSON only.`, model, key);
      input_tokens += r.input_tokens;
      output_tokens += r.output_tokens;
      const parsed = GeminiSchema.safeParse(JSON.parse(r.text));
      if (parsed.success) return { ok: true, data: parsed.data, input_tokens, output_tokens };
      lastErr = parsed.error.issues[0]?.message ?? 'schema mismatch';
      console.warn('[gemini] bad shape:', r.text.slice(0, 500));
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      console.warn('[gemini] call failed:', lastErr.slice(0, 500));
    }
  }
  return { ok: false, data: EMPTY, input_tokens, output_tokens, error: lastErr };
}

export function costInr(input_tokens: number, output_tokens: number): number {
  const ci = Number(process.env.COST_GEMINI_INR_PER_1K_INPUT ?? 0.025);
  const co = Number(process.env.COST_GEMINI_INR_PER_1K_OUTPUT ?? 0.21);
  return Number(((input_tokens / 1000) * ci + (output_tokens / 1000) * co).toFixed(4));
}
