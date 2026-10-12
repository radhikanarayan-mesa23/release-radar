import ReposManager, { type Member, type RepoRow } from '@/components/ReposManager';
import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { runs } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Repos() {
  const admin = await isAdmin();
  let repos: RepoRow[] = [], team: Member[] = [], errors: Record<string, string> = {}, dbError: string | null = null;
  try {
    repos = (await sql`select id, owner, name, category, why, active from repos
                       order by category, lower(owner), lower(name)`) as RepoRow[];
    team = (await sql`select id, name, email, role from team where active = true order by id`) as Member[];
    const last = (await runs(1))[0];
    for (const e of last?.errors ?? []) errors[e.repo] = e.error;
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Tracked repositories</h1>
        <p className="text-sm text-muted">
          Public GitHub repos only, read through the official REST API. The list is editable here — no code changes, no redeploy.
        </p>
      </header>
      {dbError
        ? <p className="card p-4 text-sm text-high">Database not reachable: {dbError}</p>
        : <ReposManager repos={repos} team={team} admin={admin} errors={errors} />}
    </div>
  );
}
