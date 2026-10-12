'use client';
import { useMemo, useState, useTransition } from 'react';
import Chip, { priorityLabel } from './Chip';
import ReleaseCard, { type CardItem, type CardTicket, type TeamOption } from './ReleaseCard';
import type { DigestPayload } from '@/lib/pipeline';
import type { TicketRow } from '@/lib/queries';

type Tab = 'needs' | 'fixed' | 'all' | 'evaluating' | 'quiet';
const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW', 'NOT_SURE'] as const;

const toCard = (t: TicketRow): CardItem => ({
  repo: t.repo, owner: t.owner, category: t.category, tag: t.tag, url: t.url,
  published_at: t.published_at, priority: t.priority, flags: t.flags ?? [],
  bump: t.bump, prerelease: t.prerelease, summary: t.summary, why: t.why, confidence: t.confidence,
});

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function Home({
  digest, needs, fixed, team, past, admin, events, nextRun,
}: {
  digest: DigestPayload | null;
  needs: TicketRow[]; fixed: TicketRow[]; team: TeamOption[];
  past: { id: number; kind: string; window_days: number; window_from: string; window_to: string; created_at: string; counts: Record<string, number> }[];
  admin: boolean;
  events: Record<number, { at: string; by_name: string | null; action: string; detail: string | null }[]>;
  nextRun: string;
}) {
  const [tab, setTab] = useState<Tab>('needs');
  const [filter, setFilter] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [emailMe, setEmailMe] = useState(true);
  const [runMsg, setRunMsg] = useState('');
  const [pending, start] = useTransition();

  const items = digest?.items ?? [];
  const counts = digest?.counts ?? { HIGH: 0, MEDIUM: 0, LOW: 0, NOT_SURE: 0, total: 0, quiet: 0, prerelease_hidden: 0 };
  const need = counts.HIGH + counts.MEDIUM + counts.NOT_SURE;

  const ticketOf = (t: TicketRow): CardTicket => ({
    ticket_id: t.ticket_id, status: t.status, assignee_id: t.assignee_id, assignee: t.assignee,
    note: t.note, updated_by: t.updated_by, updated_at: t.updated_at, fixed_at: t.fixed_at,
    history: events[t.ticket_id] ?? [],
  });

  const visibleNeeds = filter ? needs.filter((n) => n.priority === filter) : needs;

  // All releases: priority -> repo -> items
  const grouped = useMemo(() => {
    const src = filter ? items.filter((i) => i.priority === filter) : items;
    return PRIORITIES.map((p) => {
      const rows = src.filter((i) => i.priority === p);
      const byRepo = new Map<string, typeof rows>();
      rows.forEach((i) => byRepo.set(i.repo, [...(byRepo.get(i.repo) ?? []), i]));
      return { priority: p, repos: [...byRepo.entries()] };
    }).filter((g) => g.repos.length);
  }, [items, filter]);

  function runNow() {
    start(async () => {
      setRunMsg('Running…');
      const res = await fetch('/api/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, email: emailMe }),
      });
      const j = await res.json().catch(() => ({}));
      setRunMsg(res.ok ? `Done: ${j.counts?.total ?? 0} releases · ${j.emailed ? 'emailed' : 'not emailed'}. Reloading…` : (j.error ?? 'Failed'));
      if (res.ok) setTimeout(() => location.reload(), 1200);
    });
  }

  const TABS: [Tab, string][] = [
    ['needs', `Needs action (${needs.length})`],
    ['fixed', `Fixed (${fixed.length})`],
    ['all', `All releases (${counts.total})`],
    ['evaluating', `Evaluating (${digest?.evaluating.length ?? 0})`],
    ['quiet', `Quiet (${counts.quiet})`],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        {/* Briefing */}
        <section className="card p-5">
          {digest?.ai_banner && (
            <p className="mb-3 rounded-lg border border-medium/40 bg-medium/10 px-3 py-2 text-sm text-medium">
              {digest.ai_banner}
            </p>
          )}
          <h1 className="text-xl font-semibold">
            {digest ? `This week: ${need} need attention.` : 'No digest yet.'}
          </h1>
          {digest ? (
            <>
              <ul className="mt-3 space-y-1 text-sm">
                {digest.briefing.slice(0, 5).map((b, i) => (
                  <li key={i} className="flex gap-2">
                    <Chip label={priorityLabel(b.priority)} tone={b.priority} />
                    <span>{b.text}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                {day(digest.window.from)} – {day(digest.window.to)} · {digest.window.days} days · generated{' '}
                {new Date(digest.generated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {admin ? 'Use “Run now” to fetch the first digest.' : 'Nothing has been generated yet.'}
            </p>
          )}
        </section>

        {/* Priority strip */}
        <div className="no-print mt-4 flex flex-wrap gap-2">
          {PRIORITIES.map((p) => (
            <button key={p} onClick={() => setFilter(filter === p ? null : p)}
              className={`card px-3 py-2 text-sm ${filter === p ? 'ring-2 ring-ink/20' : ''}`}>
              <Chip label={priorityLabel(p)} tone={p} />{' '}
              <span className="font-semibold">{counts[p as keyof typeof counts] ?? 0}</span>
            </button>
          ))}
          <button onClick={() => { setFilter(null); setTab('quiet'); }} className="card px-3 py-2 text-sm">
            Quiet <span className="font-semibold">{counts.quiet}</span>
          </button>
          {filter && (
            <button onClick={() => setFilter(null)} className="px-2 text-sm underline text-muted">clear filter</button>
          )}
        </div>

        {/* Tabs */}
        <div className="no-print mt-4 flex flex-wrap gap-1 border-b border-line">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? 'border-ink font-medium' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {tab === 'needs' && (visibleNeeds.length ? visibleNeeds.map((t) => (
            <ReleaseCard key={t.ticket_id} item={toCard(t)} ticket={ticketOf(t)} team={team} admin={admin} />
          )) : <Empty>Nothing open. {needs.length ? 'No items match that filter.' : 'Inbox zero.'}</Empty>)}

          {tab === 'fixed' && (fixed.length ? fixed.map((t) => (
            <div key={t.ticket_id}>
              <ReleaseCard item={toCard(t)} ticket={ticketOf(t)} team={team} admin={admin} />
              <p className="px-4 pt-1 text-xs text-muted">
                {t.status === 'fixed' ? 'Fixed' : 'Dismissed'} by {t.updated_by ?? 'admin'}
                {t.fixed_at ? ` · ${new Date(t.fixed_at).toLocaleDateString('en-GB')}` : ''}
                {admin && ' · set status back to Open to reopen'}
              </p>
            </div>
          )) : <Empty>Nothing fixed yet.</Empty>)}

          {tab === 'all' && (grouped.length ? grouped.map((g) => (
            <section key={g.priority}>
              <h2 className="mb-2 mt-4 flex items-center gap-2 text-sm font-semibold">
                <Chip label={priorityLabel(g.priority)} tone={g.priority} />
                <span className="text-muted">{g.repos.reduce((n, [, r]) => n + r.length, 0)} releases</span>
              </h2>
              {g.repos.map(([repo, rows]) => <RepoGroup key={repo} repo={repo} rows={rows} />)}
            </section>
          )) : <Empty>No releases in this window.</Empty>)}

          {tab === 'evaluating' && (digest?.evaluating.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {digest.evaluating.map((e) => (
                <article key={e.repo} className="card p-4">
                  <header className="flex items-center gap-2">
                    <img src={e.avatar} alt="" className="h-6 w-6 rounded-full" />
                    <span className="font-semibold">{e.repo}</span>
                    <Chip label={e.cadence} tone="muted" />
                  </header>
                  {e.why && <p className="mt-1 text-xs text-muted">{e.why}</p>}
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                    <div><dt className="text-xs text-muted">Releases / 90d</dt><dd className="font-semibold">{e.releases_90d}</dd></div>
                    <div><dt className="text-xs text-muted">Last release</dt><dd className="font-semibold">{e.days_since_last ?? '—'}d ago</dd></div>
                    <div><dt className="text-xs text-muted">Stars</dt>
                      <dd className="font-semibold">{e.stars?.toLocaleString() ?? '—'}{' '}
                        <span className="text-xs font-normal text-muted">
                          {e.stars_delta == null ? '' : e.stars_delta >= 0 ? `+${e.stars_delta}` : e.stars_delta}
                        </span>
                      </dd></div>
                  </dl>
                  <div className="mt-3">
                    <p className="text-xs text-muted">90-day release timeline</p>
                    <div className="mt-1 flex h-4 items-center gap-[2px]">
                      {Array.from({ length: 45 }, (_, i) => {
                        const from = Date.now() - (45 - i) * 2 * 86400000;
                        const hit = e.timeline.some((d) => {
                          const t = new Date(d).getTime();
                          return t >= from && t < from + 2 * 86400000;
                        });
                        return <span key={i} className={`h-2 w-[3px] rounded-sm ${hit ? 'bg-ink' : 'bg-line'}`} />;
                      })}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <Empty>No repos marked “evaluating”.</Empty>)}

          {tab === 'quiet' && (digest?.quiet.length ? (
            <ul className="card divide-y divide-line text-sm">
              {digest.quiet.map((q) => (
                <li key={q.repo} className="flex items-center gap-2 px-4 py-2">
                  <span className="font-medium">{q.repo}</span>
                  <Chip label={q.category} tone="muted" />
                  <span className="text-muted">shipped nothing this window</span>
                </li>
              ))}
            </ul>
          ) : <Empty>Every tracked repo shipped something.</Empty>)}

          {tab === 'all' && !!counts.prerelease_hidden && (
            <p className="text-xs text-muted">{counts.prerelease_hidden} pre-releases hidden (none were flagged).</p>
          )}
          {!!digest?.errors.length && tab === 'all' && (
            <ul className="mt-3 text-xs text-high">
              {digest.errors.map((e) => <li key={e.repo}>{e.repo}: {e.error}</li>)}
            </ul>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <aside className="no-print space-y-4">
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Run now</h2>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}
              className="rounded border border-line bg-white px-2 py-1" disabled={!admin}>
              {[1, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
            </select>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={emailMe} onChange={(e) => setEmailMe(e.target.checked)} disabled={!admin} />
              Email me
            </label>
          </div>
          <button onClick={runNow} disabled={!admin || pending}
            className="mt-3 w-full rounded-lg bg-ink px-3 py-2 text-sm text-white disabled:opacity-40">
            {pending ? 'Running…' : 'Run now'}
          </button>
          {!admin && <p className="mt-2 text-xs text-muted">Log in as admin to run.</p>}
          {runMsg && <p className="mt-2 text-xs">{runMsg}</p>}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Download report</h2>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {[1, 7, 30].map((d) => (
              <a key={d} href={`/api/report?days=${d}&format=html`} target="_blank" rel="noreferrer"
                className="rounded border border-line px-2 py-1 hover:bg-paper">{d}d HTML</a>
            ))}
            <a href="/api/report?days=30&format=csv" className="rounded border border-line px-2 py-1 hover:bg-paper">30d CSV</a>
          </div>
          <p className="mt-2 text-xs text-muted">HTML prints to PDF. Admin only.</p>
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Past digests</h2>
          <PastList past={past} />
        </section>

        <section className="card p-4 text-sm">
          <h2 className="font-semibold">Next Monday run</h2>
          <p className="mt-1 text-muted">{nextRun}</p>
        </section>
      </aside>
    </div>
  );
}

function PastList({ past }: { past: Home0Past[] }) {
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();
  const latestPerDay: Home0Past[] = [];
  const rest: Home0Past[] = [];
  for (const d of past) {
    const key = d.created_at.slice(0, 10);
    (seen.has(key) ? rest : latestPerDay).push(d);
    seen.add(key);
  }
  const label = (k: string) =>
    k === 'weekly' ? 'Monday auto-run' : k === 'daily-security' ? 'Daily security' : 'Run now';
  const row = (d: Home0Past) => (
    <li key={d.id} className="py-2">
      <div className="flex justify-between gap-2">
        <span>{day(d.window_from)}–{day(d.window_to)}</span>
        <span className="text-xs text-muted">{label(d.kind)}</span>
      </div>
      <div className="text-xs text-muted">
        {d.counts?.HIGH ?? 0} high · {d.counts?.MEDIUM ?? 0} med · {d.counts?.total ?? 0} total
      </div>
    </li>
  );
  if (!past.length) return <p className="mt-2 text-xs text-muted">No runs yet.</p>;
  return (
    <>
      <ul className="mt-1 divide-y divide-line text-sm">{latestPerDay.map(row)}</ul>
      {!!rest.length && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-xs underline text-muted">
          {open ? 'Hide' : `${rest.length} earlier run${rest.length > 1 ? 's' : ''}`}
        </button>
      )}
      {open && <ul className="divide-y divide-line text-sm opacity-70">{rest.map(row)}</ul>}
    </>
  );
}
type Home0Past = { id: number; kind: string; window_days: number; window_from: string; window_to: string; created_at: string; counts: Record<string, number> };

function RepoGroup({ repo, rows }: { repo: string; rows: DigestPayload['items'] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 3);
  return (
    <div className="card mb-2 px-4 py-1">
      {shown.map((i) => (
        <ReleaseCard key={i.tag} item={i as unknown as CardItem} compact />
      ))}
      {rows.length > 3 && (
        <button onClick={() => setOpen(!open)} className="py-2 text-xs underline text-muted">
          {open ? 'Show less' : `Show ${rows.length - 3} more from ${repo}`}
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="card p-6 text-center text-sm text-muted">{children}</p>;
}
