import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  category: z.enum(['dependency', 'evaluating']).optional(),
  active: z.boolean().optional(),
  why: z.string().optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const { category, active, why } = p.data;
  const rows = await sql`
    update repos set
      category = coalesce(${category ?? null}, category),
      active   = coalesce(${active ?? null}, active),
      why      = coalesce(${why ?? null}, why)
    where id = ${id} returning id, owner, name, category, active, why`;
  return Response.json({ ok: true, repo: rows[0] });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  await sql`delete from repos where id = ${id}`;
  return Response.json({ ok: true });
}
