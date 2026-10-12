import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { card, esc, sendWithFallback, shell } from '@/lib/email';

export const dynamic = 'force-dynamic';

const Patch = z.object({
  status: z.enum(['open', 'in_progress', 'fixed', 'dismissed']).optional(),
  assignee_id: z.number().int().nullable().optional(),
  note: z.string().max(2000).optional(),
  by: z.string().max(60).optional(),
});

const LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'In progress', fixed: 'Fixed', dismissed: 'Dismissed',
};

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const id = Number((await ctx.params).id);
  const p = Patch.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: 'bad body' }, { status: 400 });
  const { status, assignee_id, note } = p.data;
  const by = p.data.by || 'Keerthi';

  const rows = (await sql`
    update tickets set
      status      = coalesce(${status ?? null}, status),
      assignee_id = case when ${assignee_id !== undefined} then ${assignee_id ?? null}::int else assignee_id end,
      note        = coalesce(${note ?? null}, note),
      updated_at  = now(), updated_by = ${by},
      fixed_at    = case when ${status ?? null} = 'fixed' then now()
                         when ${status ?? null} in ('open','in_progress') then null
                         else fixed_at end
    where id = ${id}
    returning id, release_id, status, priority, assignee_id, note, updated_by, updated_at, fixed_at`) as {
      id: number; release_id: number; status: string; priority: string;
      assignee_id: number | null; note: string | null; updated_by: string; updated_at: string; fixed_at: string | null;
    }[];
  if (!rows.length) return Response.json({ error: 'ticket not found' }, { status: 404 });
  const t = rows[0];

  if (status) await event(id, by, 'status', `Moved to ${LABEL[status]}`);
  if (note !== undefined) await event(id, by, 'note', 'Note updated');

  let emailMsg: string | null = null;
  if (assignee_id !== undefined) {
    const who = assignee_id
      ? ((await sql`select name, email from team where id = ${assignee_id}`) as { name: string; email: string }[])[0]
      : null;
    await event(id, by, 'assigned', who ? `Assigned to ${who.name}` : 'Unassigned');
    if (who) emailMsg = await notify(t.release_id, who, by, t.note, t.priority, id);
  }

  const assignee = t.assignee_id
    ? ((await sql`select name from team where id = ${t.assignee_id}`) as { name: string }[])[0]?.name ?? null
    : null;

  return Response.json({ ok: true, ticket: { ...t, ticket_id: t.id, assignee }, email: emailMsg });
}

async function event(ticket_id: number, by: string, action: string, detail: string) {
  await sql`insert into ticket_events (ticket_id, by_name, action, detail)
            values (${ticket_id}, ${by}, ${action}, ${detail})`;
}

async function notify(
  release_id: number, who: { name: string; email: string }, by: string,
  note: string | null, priority: string, ticket_id: number,
): Promise<string> {
  const r = ((await sql`
    select r.tag, r.url, r.flags, r.summary, r.why, (p.owner || '/' || p.name) as repo, p.owner, p.category
    from releases r join repos p on p.id = r.repo_id where r.id = ${release_id}`) as {
      tag: string; url: string; flags: string[]; summary: string[] | null;
      why: string | null; repo: string; owner: string; category: string;
    }[])[0];
  if (!r) return 'Assigned (release missing, no email sent)';

  const subject = `${by} assigned you: ${r.repo} ${r.tag} (${priority.replace('_', ' ')}${r.flags?.length ? ` · ${r.flags.join(' · ')}` : ''})`;
  const html = shell(subject, [
    card({ repo: r.repo, tag: r.tag, url: r.url, priority, flags: r.flags ?? [], why: r.why ?? '', summary: r.summary ?? [] }),
    note ? `<p style="font-size:13px"><b>Note from ${esc(by)}:</b> ${esc(note)}</p>` : '',
  ].join(''));

  const res = await sendWithFallback(who.email, subject, html, who.name);
  const detail = res.ok
    ? (res.fellBackTo ? `Email for ${who.name} forwarded to ${res.fellBackTo}` : `Emailed ${who.email}`)
    : `Email failed: ${res.error}`;
  await event(ticket_id, by, 'emailed', detail);
  return detail;
}
