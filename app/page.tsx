import Home from '@/components/Home';
import { isAdmin } from '@/lib/auth';
import { greetingIST, nextMondayRun } from '@/lib/schedule';
import { sql } from '@/lib/db';
import { latestDigest, manifestDeps, pastDigests, team, ticketEvents, tickets, type TicketRow } from '@/lib/queries';
import { matchRelease, type Match } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const admin = await isAdmin();
  const events: Record<number, { at: string; by_name: string | null; action: string; detail: string | null }[]> = {};
  let digest = null, needs: TicketRow[] = [], fixed: TicketRow[] = [],
    members: { id: number; name: string }[] = [], past: Awaited<ReturnType<typeof pastDigests>> = [],
    error: string | null = null;

  let repoCount = 0, evaluatingCount = 0;
  let matches: Record<number, Match> = {};
  let manifestCount = 0;
  try {
    [digest, needs, fixed, members, past] = await Promise.all([
      latestDigest(), tickets(['open', 'in_progress']), tickets(['fixed', 'dismissed']),
      team(), pastDigests(),
    ]);
    const rows = await ticketEvents([...needs, ...fixed].map((t) => t.ticket_id));
    for (const e of rows) (events[e.ticket_id] ??= []).push(e);
    const rc = (await sql`
      select count(*) filter (where active)::int as tracked,
             count(*) filter (where active and category = 'evaluating')::int as evaluating
      from repos`) as { tracked: number; evaluating: number }[];
    repoCount = rc[0].tracked; evaluatingCount = rc[0].evaluating;

    // "Is this actually in my codebase?" — compare each open item against the
    // ranges in her package.json. Cheap: one query, then pure comparison.
    const deps = await manifestDeps();
    manifestCount = deps.size;
    if (deps.size) {
      matches = Object.fromEntries([...needs, ...fixed].map((t) => [
        t.ticket_id,
        matchRelease({ owner: t.owner, name: t.repo.split('/')[1], tag: t.tag, package_name: t.package_name }, deps),
      ]));
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Database not reachable</h1>
        <p className="mt-2 text-sm text-muted">
          Set <code>DATABASE_URL</code> and run <code>db/schema.sql</code> then <code>db/seed.sql</code> in the Neon SQL editor.
        </p>
        <p className="mt-2 text-xs text-muted">{error}</p>
      </div>
    );
  }

  return (
    <Home digest={digest} needs={needs} fixed={fixed} team={members} past={past} admin={admin}
      events={events} nextRun={nextMondayRun()} repoCount={repoCount} evaluatingCount={evaluatingCount}
      greeting={greetingIST()} matches={matches} manifestCount={manifestCount} />
  );
}
