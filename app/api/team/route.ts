import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().min(1).max(60),
  email: z.string().email(),
  role: z.string().max(80).optional(),
});

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: 'Name and a valid email are required' }, { status: 400 });
  const { name, email, role } = p.data;
  const rows = await sql`
    insert into team (name, email, role) values (${name}, ${email}, ${role ?? null})
    on conflict (email) do update set name = excluded.name, role = excluded.role, active = true
    returning id, name, email, role`;
  return Response.json({ ok: true, member: rows[0] });
}

export async function DELETE(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return Response.json({ error: 'id required' }, { status: 400 });
  await sql`update team set active = false where id = ${id}`; // keep history on tickets
  return Response.json({ ok: true });
}
