import { z } from 'zod';
import { sql } from '@/lib/db';
import { checkBudget, recordUsage } from '@/lib/budget';
import { askAssistant, costInr, type ChatTurn } from '@/lib/gemini';
import type { DigestPayload } from '@/lib/pipeline';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const Body = z.object({
  question: z.string().min(2).max(500),
  history: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().max(4000) })).max(6).default([]),
});

/** Compact, token-cheap grounding: the digest the pipeline already stored. */
async function buildContext(): Promise<string | null> {
  const rows = (await sql`select payload from digests order by created_at desc limit 1`) as
    { payload: DigestPayload }[];
  if (!rows.length) return null;
  const p = rows[0].payload;

  const tickets = (await sql`
    select t.status, t.priority, m.name as assignee, (r2.owner || '/' || r2.name) as repo, r.tag
    from tickets t
    join releases r on r.id = t.release_id
    join repos r2 on r2.id = r.repo_id
    left join team m on m.id = t.assignee_id
    where t.status in ('open','in_progress')
    order by case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 else 2 end
    limit 40`) as { status: string; priority: string; assignee: string | null; repo: string; tag: string }[];

  const line = (i: DigestPayload['items'][number]) =>
    `- ${i.repo} ${i.tag} [${i.priority}${i.flags.length ? ' ' + i.flags.join('+') : ''}] ${i.why}` +
    (i.summary?.length ? ` :: ${i.summary[0]}` : '');

  const byP = (p0: string) => p.items.filter((i) => i.priority === p0);

  return [
    `WINDOW: ${p.window.from.slice(0, 10)} to ${p.window.to.slice(0, 10)} (${p.window.days} days), generated ${p.generated_at.slice(0, 16).replace('T', ' ')}`,
    `COUNTS: high ${p.counts.HIGH}, medium ${p.counts.MEDIUM}, low ${p.counts.LOW}, not_sure ${p.counts.NOT_SURE}, quiet repos ${p.counts.quiet}, prereleases hidden ${p.counts.prerelease_hidden}`,
    `BRIEFING:\n${p.briefing.map((b) => `- [${b.priority}] ${b.text}`).join('\n')}`,
    `HIGH:\n${byP('HIGH').map(line).join('\n') || '- none'}`,
    `MEDIUM:\n${byP('MEDIUM').map(line).join('\n') || '- none'}`,
    `NOT_SURE:\n${byP('NOT_SURE').map(line).join('\n') || '- none'}`,
    `LOW (routine, names only): ${byP('LOW').slice(0, 30).map((i) => `${i.repo} ${i.tag}`).join(', ') || 'none'}`,
    `EVALUATING: ${p.evaluating.map((e) => `${e.repo} — ${e.releases_90d} releases/90d, last ${e.days_since_last}d ago, ${e.stars} stars, ${e.cadence}`).join(' | ') || 'none'}`,
    `QUIET (shipped nothing): ${p.quiet.map((q) => q.repo).join(', ') || 'none'}`,
    `OPEN TICKETS:\n${tickets.map((t) => `- ${t.repo} ${t.tag} [${t.priority}] ${t.status}${t.assignee ? ` assigned to ${t.assignee}` : ' unassigned'}`).join('\n') || '- none'}`,
  ].join('\n\n').slice(0, 14000);
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Ask a question (2–500 characters).' }, { status: 400 });

  // Public endpoint: cap it before spending anything.
  const capped = await checkBudget('chat', req);
  if (capped) return Response.json({ error: capped }, { status: 429 });

  let context: string | null;
  try {
    context = await buildContext();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Database unavailable' }, { status: 500 });
  }
  if (!context) return Response.json({ error: 'No digest yet — run one first and I will have something to read.' }, { status: 404 });

  await recordUsage('chat', req);
  const r = await askAssistant(parsed.data.question, context, parsed.data.history as ChatTurn[]);
  if (!r.ok) return Response.json({ error: r.error ?? 'Gemini is unavailable right now.' }, { status: 502 });

  return Response.json({
    ok: true, answer: r.text,
    cost_inr: costInr(r.input_tokens, r.output_tokens),
    tokens: r.input_tokens + r.output_tokens,
  });
}
