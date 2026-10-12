import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { classify } from '@/lib/gemini';
import { CASES } from '@/lib/quality';
import { applyRules } from '@/lib/rules';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** One Gemini call over the 13 fixtures; the result is stored and shown on /quality. */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;

  const input = CASES.map((c) => ({
    id: c.id, repo: c.repo, category: 'dependency', tag: c.tag,
    title: c.title, body: c.body,
    rule_flags: applyRules({ tag: c.tag, prev_tag: c.prev_tag, title: c.title, body: c.body }).flags,
  }));

  const ai = await classify(input);
  if (!ai.ok) return Response.json({ error: ai.error ?? 'Gemini failed' }, { status: 502 });

  await sql`
    insert into evals (results, input_tokens, output_tokens)
    values (${JSON.stringify(ai.data.items)}::jsonb, ${ai.input_tokens}, ${ai.output_tokens})`;
  return Response.json({ ok: true, items: ai.data.items.length, input_tokens: ai.input_tokens, output_tokens: ai.output_tokens });
}
