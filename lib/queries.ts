import { sql } from './db';
import type { DigestPayload } from './pipeline';

export interface TicketRow {
  ticket_id: number; status: string; priority: string; note: string | null;
  assignee_id: number | null; assignee: string | null; updated_by: string | null;
  updated_at: string; fixed_at: string | null;
  release_id: number; tag: string; title: string | null; url: string | null;
  published_at: string | null; flags: string[]; bump: string | null;
  prerelease: boolean; summary: string[] | null; why: string | null; confidence: number | null;
  repo: string; owner: string; category: string;
}
export interface TeamRow { id: number; name: string; email: string; role: string | null }
export interface RunRow {
  id: number; kind: string; window_days: number; started_at: string; finished_at: string | null;
  repos_checked: number | null; releases_found: number | null;
  gemini_input_tokens: number; gemini_output_tokens: number; cost_inr: string; emailed: boolean;
  errors: { repo: string; error: string }[] | null;
}

/**
 * The digest Keerthi reads — the newest weekly or manual run.
 *
 * The daily 08:30 sweep is a 1-day SECURITY alert, not her digest: letting it
 * win would blank the board to a single day every morning. Prefer a weekly or
 * manual digest, and fall back to a daily one only if nothing else exists.
 */
export async function latestDigest(): Promise<DigestPayload | null> {
  const rows = (await sql`
    select payload from digests
    order by (kind <> 'daily-security') desc, created_at desc
    limit 1`) as { payload: DigestPayload }[];
  return rows[0]?.payload ?? null;
}

export async function tickets(statuses: string[]): Promise<TicketRow[]> {
  return (await sql`
    select t.id as ticket_id, t.status, t.priority, t.note, t.assignee_id, t.updated_by,
           t.updated_at, t.fixed_at, m.name as assignee,
           r.id as release_id, r.tag, r.title, r.url, r.published_at, r.flags, r.bump,
           r.prerelease, r.summary, r.why, r.confidence,
           (p.owner || '/' || p.name) as repo, p.owner, p.category
    from tickets t
    join releases r on r.id = t.release_id
    join repos p on p.id = r.repo_id
    left join team m on m.id = t.assignee_id
    where t.status = any(${statuses as unknown as string}::text[])
    order by case t.priority when 'HIGH' then 0 when 'MEDIUM' then 1 when 'NOT_SURE' then 2 else 3 end,
             r.published_at desc nulls last`) as TicketRow[];
}

export async function team(): Promise<TeamRow[]> {
  return (await sql`select id, name, email, role from team where active = true order by id`) as TeamRow[];
}

export async function runs(limit = 20): Promise<RunRow[]> {
  return (await sql`select * from runs order by started_at desc limit ${limit}`) as RunRow[];
}

export async function pastDigests(limit = 20) {
  return (await sql`
    select id, kind, window_days, window_from, window_to, created_at, counts
    from digests order by created_at desc limit ${limit}`) as {
      id: number; kind: string; window_days: number; window_from: string;
      window_to: string; created_at: string; counts: Record<string, number>;
    }[];
}

export async function ticketEvents(ticketIds: number[]) {
  if (!ticketIds.length) return [] as { ticket_id: number; at: string; by_name: string | null; action: string; detail: string | null }[];
  return (await sql`
    select ticket_id, at, by_name, action, detail from ticket_events
    where ticket_id = any(${ticketIds as unknown as string}::int[])
    order by at desc`) as { ticket_id: number; at: string; by_name: string | null; action: string; detail: string | null }[];
}
