import { nextMondayRun } from '@/lib/schedule';
import { sql } from '@/lib/db';
import { runs, type RunRow } from '@/lib/queries';
import { LIMITS, usageToday } from '@/lib/budget';

export const dynamic = 'force-dynamic';

const ENV_VARS = [
  'DATABASE_URL', 'GITHUB_TOKEN', 'GEMINI_API_KEY', 'GEMINI_MODEL',
  'RESEND_API_KEY', 'EMAIL_FROM', 'DIGEST_TO', 'ADMIN_PASSCODE', 'CRON_SECRET', 'APP_URL',
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
];

function Meter({ label, used, cap }: { label: string; used: number; cap: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(cap, 1)) * 100));
  const tone = pct >= 90 ? 'bg-high' : pct >= 60 ? 'bg-medium' : 'bg-accent';
  return (
    <div className="card-glow rounded-xl border border-line bg-ink0 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-sm font-semibold">{used}<span className="text-xs font-normal text-muted"> / {cap}</span></span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-glow card-sheen p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

export default async function Status() {
  let rows: RunRow[] = [], repoCount = 0, monthCost = 0, repoErrors: { repo: string; error: string }[] = [], dbError: string | null = null;
  try {
    rows = await runs(20);
    repoCount = Number(((await sql`select count(*)::int as n from repos where active = true`) as { n: number }[])[0].n);
    monthCost = Number(((await sql`
      select coalesce(sum(cost_inr),0)::float as c from runs
      where started_at >= date_trunc('month', now())`) as { c: number }[])[0].c);
    repoErrors = rows[0]?.errors ?? [];
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  const used = await usageToday();
  const n = (k: string) => used.find((u) => u.kind === k)?.n ?? 0;
  const aiToday = used.reduce((t, u) => t + u.n, 0);
  const last = rows[0];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Status</h1>
      {dbError && <p className="card p-4 text-sm text-high">Database not reachable: {dbError}</p>}

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Last run" value={last ? `${new Date(last.started_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}` : '—'} />
        <Stat label="Next Monday run" value={nextMondayRun()} />
        <Stat label="Active repos" value={String(repoCount)} />
        <Stat label="AI cost this month" value={`₹${monthCost.toFixed(4)}`} />
      </div>

      <section className="card card-settle p-4">
        <h2 className="text-sm font-semibold">AI budget guards (last 24h)</h2>
        <p className="mt-1 text-xs text-muted">
          This is a public demo, so the endpoints that cost money are capped. Reaching a cap never
          breaks the site — the stored digest, every tab, the reports and the emails keep working,
          and the pipeline already falls back to rule-only flags if Gemini is unavailable.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Meter label="AI calls today" used={aiToday} cap={LIMITS.geminiCallsPerDay()} />
          <Meter label="Assistant questions" used={n('chat')} cap={LIMITS.chatPerDay()} />
          <Meter label="Manual runs" used={n('run')} cap={LIMITS.runPerDay()} />
        </div>
        <p className="mt-3 text-xs text-muted">
          Also: {LIMITS.chatPerIpPerHour()} questions per visitor per hour, and {LIMITS.runCooldownSec()}s
          between manual runs. Scheduled Monday and daily runs are never blocked.
        </p>
      </section>

      <section className="card card-settle overflow-x-auto">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Runs</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>{['Started', 'Kind', 'Window', 'Repos', 'Releases', 'Tokens', '₹', 'Emailed', 'Errors'].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{h}</th>))}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(r.started_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td className="px-3 py-2">{r.kind}</td>
                <td className="px-3 py-2">{r.window_days}d</td>
                <td className="px-3 py-2">{r.repos_checked ?? '—'}</td>
                <td className="px-3 py-2">{r.releases_found ?? '—'}</td>
                <td className="px-3 py-2">{r.gemini_input_tokens + r.gemini_output_tokens}</td>
                <td className="px-3 py-2">{Number(r.cost_inr).toFixed(4)}</td>
                <td className="px-3 py-2">{r.emailed ? 'yes' : 'no'}</td>
                <td className="px-3 py-2">{r.errors?.length ?? 0}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="px-3 py-4 text-muted" colSpan={9}>No runs yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card card-settle p-4">
        <h2 className="text-sm font-semibold">Environment</h2>
        <p className="text-xs text-muted">Names only — values are never shown or sent to the client.</p>
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          {ENV_VARS.map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${process.env[k] ? 'bg-low' : 'bg-high'}`} />
              <code className="text-xs">{k}</code>
              <span className="text-xs text-muted">{process.env[k] ? 'set' : 'missing'}</span>
            </li>
          ))}
        </ul>
      </section>

      {!!repoErrors.length && (
        <section className="card card-settle p-4">
          <h2 className="text-sm font-semibold">Repo errors (last run)</h2>
          <ul className="mt-2 space-y-1 text-sm text-high">
            {repoErrors.map((e) => <li key={e.repo}>{e.repo}: {e.error}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
