import Chip, { priorityLabel } from '@/components/Chip';
import EvalButton from '@/components/EvalButton';
import { isAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { grade, type EvalItem } from '@/lib/quality';

export const dynamic = 'force-dynamic';

export default async function Quality() {
  const admin = await isAdmin();
  let stored: { results: EvalItem[]; created_at: string } | null = null;
  try {
    stored = ((await sql`select results, created_at from evals order by created_at desc limit 1`) as
      { results: EvalItem[]; created_at: string }[])[0] ?? null;
  } catch { /* DB not reachable: rules-only view still works */ }

  const { rows, score } = grade(stored?.results ?? []);

  const Stat = ({ label, value, hint }: { label: string; value: string | number; hint?: string }) => (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="card p-5">
        <h1 className="text-xl font-semibold">Classifier quality</h1>
        <p className="mt-1 text-sm text-muted">
          <code>lib/rules.ts</code> run live over {score.total} synthetic fixtures, next to the last stored Gemini
          evaluation. Final flags = rules <b>OR</b> Gemini: the model may add a flag, never remove one.
        </p>
        {admin && <EvalButton />}
        {stored && (
          <p className="mt-2 text-xs text-muted">
            Gemini evaluation stored {new Date(stored.created_at).toLocaleString('en-GB')}
          </p>
        )}
        {!stored && <p className="mt-2 text-xs text-muted">No Gemini evaluation stored yet — the AI columns are empty.</p>}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Rules only" value={`${score.rulesOnly}/${score.total}`} hint="no AI call" />
        <Stat label="Rules + Gemini" value={`${score.withAi}/${score.total}`} />
        <Stat label="Security fixes missed" value={score.securityMissed} hint="must stay 0" />
        <Stat label="Caught by Gemini only" value={score.aiOnly} hint="F10 is designed for this" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              {['Case', 'Repo / tag', 'Expected', 'Rules', 'Gemini', 'Final', ''].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 font-mono text-xs">{r.id}</td>
                <td className="px-3 py-2"><div>{r.repo}</div><div className="text-xs text-muted">{r.tag}</div></td>
                <td className="px-3 py-2">
                  <Chip label={priorityLabel(r.expected.priority)} tone={r.expected.priority} />
                  <div className="mt-1 text-xs text-muted">{r.expected.flags.join(', ') || 'no flags'}</div>
                </td>
                <td className="px-3 py-2">
                  <Chip label={priorityLabel(r.rules.priority)} tone={r.rules.priority} />
                  <div className="mt-1 text-xs text-muted">{r.rules.flags.join(', ') || 'no flags'}</div>
                </td>
                <td className="px-3 py-2 text-xs text-muted">
                  {r.ai ? <>{r.ai.flags.join(', ') || 'no flags'}<div>conf {r.ai.confidence}</div></> : '—'}
                </td>
                <td className="px-3 py-2">
                  <Chip label={priorityLabel(r.final.priority)} tone={r.final.priority} />
                  <div className="mt-1 text-xs text-muted">{r.final.flags.join(', ') || 'no flags'}</div>
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.finalOk ? <span className="text-low">pass</span> : <span className="text-high">miss</span>}
                  {!r.rulesOk && r.finalOk && <div className="text-notsure">AI saved it</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        F10 has no security keyword, so the rules cannot see it — that is the case the model has to catch.
        F13 fixes a CVE only inside <code>/examples</code>, so it must <b>not</b> be HIGH.
      </p>
    </div>
  );
}
