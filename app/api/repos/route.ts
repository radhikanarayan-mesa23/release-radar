import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { getRepo, parseRepoRef, pool, splitRepoInput } from '@/lib/github';

export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().min(1),
  category: z.enum(['dependency', 'evaluating']).default('dependency'),
  why: z.string().optional(),
});

export async function GET() {
  const rows = await sql`
    select id, owner, name, category, why, active, created_at from repos
    order by category, lower(owner), lower(name)`;
  return Response.json({ repos: rows });
}

/** Bulk add: several links or owner/name values, space / comma / newline separated. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Paste at least one repo' }, { status: 400 });
  const { text, category, why } = parsed.data;

  const refs = splitRepoInput(text);
  const results = await pool(refs, 5, async (raw) => {
    const ref = parseRepoRef(raw);
    if (!ref) return { raw, status: 'invalid' as const };
    try {
      const meta = await getRepo(ref.owner, ref.name); // validate live, keep canonical case
      const [owner, name] = meta.full_name.split('/');
      const rows = (await sql`
        insert into repos (owner, name, category, why) values (${owner}, ${name}, ${category}, ${why ?? null})
        on conflict do nothing returning id`) as { id: number }[];
      return { raw, status: rows.length ? ('added' as const) : ('duplicate' as const), repo: meta.full_name };
    } catch {
      return { raw, status: 'not_found' as const };
    }
  });

  const n = (s: string) => results.filter((r) => r.status === s).length;
  return Response.json({
    ok: true, results,
    message: `Added ${n('added')} · already tracked ${n('duplicate')} · not found ${n('not_found') + n('invalid')}`,
  });
}
