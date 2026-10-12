'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import Chip, { priorityLabel, PRIORITY_HEX } from './Chip';
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

export interface PastRow {
  id: number; kind: string; window_days: number; window_from: string;
  window_to: string; created_at: string; counts: Record<string, number>;
}

export default function Home({
  digest, needs, fixed, team, past, admin, events, nextRun, repoCount, evaluatingCount,
}: {
  digest: DigestPayload | null; needs: TicketRow[]; fixed: TicketRow[]; team: TeamOption[];
  past: PastRow[]; admin: boolean;
  events: Record<number, { at: string; by_name: string | null; action: string; detail: string | null }[]>;
  nextRun: string; repoCount: number; evaluatingCount: number;
}) {
  const [tab, setTab] = useState<Tab>('needs');
  const [filter, setFilter] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [emailMe, setEmailMe] = useState(true);
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  const anchorMs = digest ? new Date(digest.generated_at).getTime() : 0;
  const items = digest?.items ?? [];
  const counts = digest?.counts ?? { HIGH: 0, MEDIUM: 0, LOW: 0, NOT_SURE: 0, total: 0, quiet: 0, prerelease_hidden: 0 };
  // The tiles segment the real work queue (open + in-progress tickets), not the
  // digest payload: tickets persist across runs, so a ticket from an earlier run
  // is still work. LOW has no ticket, so it stays informational from the digest.
  const need = needs.length;
  const inProgress = needs.filter((n) => n.status === 'in_progress').length;
  const unassigned = needs.filter((n) => !n.assignee_id).length;
  const queue: Record<string, number> = {
    HIGH: needs.filter((n) => n.priority === 'HIGH').length,
    MEDIUM: needs.filter((n) => n.priority === 'MEDIUM').length,
    NOT_SURE: needs.filter((n) => n.priority === 'NOT_SURE').length,
    LOW: counts.LOW,
  };

  const ticketOf = (t: TicketRow): CardTicket => ({
    ticket_id: t.ticket_id, status: t.status, assignee_id: t.assignee_id, assignee: t.assignee,
    note: t.note, updated_by: t.updated_by, updated_at: t.updated_at, fixed_at: t.fixed_at,
    history: events[t.ticket_id] ?? [],
  });

  const visibleNeeds = filter ? needs.filter((n) => n.priority === filter) : needs;
  const topHigh = needs.filter((n) => n.priority === 'HIGH').slice(0, 3);

  const grouped = useMemo(() => {
    const src = filter ? items.filter((i) => i.priority === filter) : items;
    return PRIORITIES.map((p) => {
      const rows = src.filter((i) => i.priority === p);
      const byRepo = new Map<string, typeof rows>();
      rows.forEach((i) => byRepo.set(i.repo, [...(byRepo.get(i.repo) ?? []), i]));
      return { priority: p, repos: [...byRepo.entries()] };
    }).filter((g) => g.repos.length);
  }, [items, filter]);

  function post(url: string, body?: unknown, label = 'Working…') {
    start(async () => {
      setMsg(label);
      const res = await fetch(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? 'Failed — are you logged in as admin?'); return; }
      if (url === '/api/run') { setMsg(`Done — ${j.counts?.total ?? 0} releases. Refreshing…`); setTimeout(() => location.reload(), 1100); }
      else setMsg(`Digest emailed to ${j.to}`);
      setTimeout(() => setMsg(''), 6000);
    });
  }

  const TABS: [Tab, string, number][] = [
    ['needs', 'Needs action', needs.length],
    ['fixed', 'Previous issues', fixed.length],
    ['all', 'All releases', counts.total],
    ['evaluating', 'Evaluating', digest?.evaluating.length ?? 0],
    ['quiet', 'Quiet', counts.quiet],
  ];

  return (
    <div className="space-y-5">
      {digest?.ai_banner && (
        <p className="card border-medium/40 bg-medium/10 px-4 py-2 text-sm text-medium">{digest.ai_banner}</p>
      )}

      {/* ---- key metrics: each tile filters the lists below ---- */}
      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Need attention" value={need} hint={`${unassigned} unassigned`} accent
          onClick={() => { setFilter(null); setTab('needs'); }} active={!filter && tab === 'needs'} />
        {PRIORITIES.map((p) => (
          <Tile key={p} label={priorityLabel(p)} value={queue[p] ?? 0}
            dot={PRIORITY_HEX[p]} active={filter === p}
            hint={p === 'HIGH' ? 'open · security / breaking' : p === 'MEDIUM' ? 'open · plan upgrade' : p === 'LOW' ? 'routine, no ticket' : 'open · low confidence'}
            onClick={() => { setFilter(filter === p ? null : p); setTab(p === 'LOW' ? 'all' : 'needs'); }} />
        ))}
        <Tile label="Quiet repos" value={counts.quiet} hint={`of ${repoCount} tracked`}
          onClick={() => { setFilter(null); setTab('quiet'); }} active={tab === 'quiet'} />
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ---- focus + tabs ---- */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <section className="card p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold">Your focus today</h1>
              {digest && (
                <span className="text-xs text-muted">
                  {day(digest.window.from)} – {day(digest.window.to)} · {digest.window.days} days · generated{' '}
                  {new Date(digest.generated_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              )}
            </div>

            {!digest ? (
              <p className="mt-2 text-sm text-muted">
                No digest yet. {admin ? 'Use “Run now”.' : 'Nothing has been generated.'}
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm">
                  {need > 0 ? (
                    <>
                      <span className="text-2xl font-semibold text-accent">{need}</span>{' '}
                      release{need > 1 ? 's' : ''} need you — {queue.HIGH} high
                      {inProgress > 0 && <>, {inProgress} already in progress</>}.
                    </>
                  ) : <>Nothing urgent. {counts.LOW} routine release{counts.LOW === 1 ? '' : 's'} logged.</>}
                </p>

                <PriorityBar counts={queue} onPick={(p) => { setFilter(p); setTab('needs'); }} />

                <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-muted">Key insights</h2>
                <ul className="mt-2 space-y-2">
                  {digest.briefing.slice(0, 5).map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <Chip label={priorityLabel(b.priority)} tone={b.priority} />
                      <span className="min-w-0">{b.text}</span>
                    </li>
                  ))}
                </ul>

                {!!topHigh.length && (
                  <div className="mt-4 border-t border-line pt-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Start here</h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {topHigh.map((t) => (
                        <button key={t.ticket_id} onClick={() => { setFilter('HIGH'); setTab('needs'); }}
                          className="card-hover flex items-center gap-2 rounded-xl border border-line bg-ink3 px-3 py-2 text-left text-xs">
                          <span className="h-5 w-[3px] rounded-full bg-high" />
                          <span><span className="font-medium">{t.repo}</span> <span className="text-muted">{t.tag}</span></span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="card">
            <div className="no-print flex flex-wrap items-center gap-1 border-b border-line px-2 pt-2">
              {TABS.map(([k, label, n]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm transition
                    ${tab === k ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'}`}>
                  {label} <span className="text-xs text-muted">{n}</span>
                </button>
              ))}
              {filter && (
                <button onClick={() => setFilter(null)}
                  className="ml-auto mr-2 text-xs text-accent underline">clear {priorityLabel(filter)} filter</button>
              )}
            </div>

            <div className="space-y-3 p-3">
              {tab === 'needs' && (visibleNeeds.length ? visibleNeeds.map((t) => (
                <ReleaseCard key={t.ticket_id} item={toCard(t)} ticket={ticketOf(t)} team={team} admin={admin} />
              )) : <Empty>{needs.length ? 'Nothing matches that filter.' : 'Inbox zero — nothing open.'}</Empty>)}

              {tab === 'fixed' && (fixed.length ? fixed.map((t) => (
                <div key={t.ticket_id}>
                  <ReleaseCard item={toCard(t)} ticket={ticketOf(t)} team={team} admin={admin} />
                  <p className="px-4 pt-1 text-xs text-muted">
                    {t.status === 'fixed' ? 'Fixed' : 'Dismissed'} by {t.updated_by ?? 'admin'}
                    {t.fixed_at ? ` · ${new Date(t.fixed_at).toLocaleDateString('en-GB')}` : ''}
                    {admin && ' · set status back to Open to reopen'}
                  </p>
                </div>
              )) : <Empty>Nothing resolved yet. Items you mark Fixed or Dismissed land here and stay here.</Empty>)}

              {tab === 'all' && (grouped.length ? grouped.map((g) => (
                <section key={g.priority}>
                  <h3 className="mb-2 mt-3 flex items-center gap-2 text-sm font-semibold">
                    <Chip label={priorityLabel(g.priority)} tone={g.priority} />
                    <span className="text-xs text-muted">{g.repos.reduce((n, [, r]) => n + r.length, 0)} releases</span>
                  </h3>
                  {g.repos.map(([repo, rows]) => <RepoGroup key={repo} repo={repo} rows={rows} />)}
                </section>
              )) : <Empty>No releases in this window.</Empty>)}

              {tab === 'evaluating' && (digest?.evaluating.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {digest.evaluating.map((e) => (
                    <article key={e.repo} className="card card-hover p-4">
                      <header className="flex items-center gap-2">
                        <img src={e.avatar} alt="" className="h-6 w-6 rounded-full" />
                        <a href={`https://github.com/${e.repo}`} target="_blank" rel="noreferrer"
                          className="font-semibold hover:text-accent">{e.repo}</a>
                        <Chip label={e.cadence} tone={e.cadence === 'Stalled' ? 'HIGH' : 'ACCENT'} />
                      </header>
                      {e.why && <p className="mt-1 text-xs text-muted">{e.why}</p>}
                      <dl className="mt-3 grid grid-cols-3 gap-2">
                        <Mini label="Releases / 90d" value={e.releases_90d} />
                        <Mini label="Last release" value={e.days_since_last == null ? '—' : `${e.days_since_last}d`} />
                        <Mini label="Stars" value={e.stars?.toLocaleString() ?? '—'}
                          delta={e.stars_delta == null ? undefined : e.stars_delta} />
                      </dl>
                      <Timeline dates={e.timeline} anchor={anchorMs} />
                    </article>
                  ))}
                </div>
              ) : <Empty>No repos marked “evaluating”.</Empty>)}

              {tab === 'quiet' && (digest?.quiet.length ? (
                <ul className="divide-y divide-line text-sm">
                  {digest.quiet.map((q) => (
                    <li key={q.repo} className="flex items-center gap-2 px-2 py-2">
                      <a href={`https://github.com/${q.repo}`} target="_blank" rel="noreferrer"
                        className="font-medium hover:text-accent">{q.repo}</a>
                      <Chip label={q.category} tone="muted" />
                      <span className="text-xs text-muted">shipped nothing this window</span>
                    </li>
                  ))}
                </ul>
              ) : <Empty>Every tracked repo shipped something.</Empty>)}

              {tab === 'all' && !!counts.prerelease_hidden && (
                <p className="px-2 text-xs text-muted">{counts.prerelease_hidden} pre-releases hidden (none flagged).</p>
              )}
              {tab === 'all' && !!digest?.errors.length && (
                <ul className="px-2 text-xs text-high">
                  {digest.errors.map((e) => <li key={e.repo}>{e.repo}: {e.error}</li>)}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ---- actions sidebar ---- */}
        <aside className="no-print space-y-4">
          <section className="card p-4">
            <h2 className="text-sm font-semibold">Run a check</h2>
            <p className="mt-1 text-xs text-muted">Runs automatically every Monday 08:00 IST. {nextRun}.</p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={!admin}
                aria-label="Window" className="rounded-lg border border-line bg-ink3 px-2 py-1 disabled:opacity-40">
                {[1, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={emailMe} disabled={!admin}
                  onChange={(e) => setEmailMe(e.target.checked)} className="accent-[#F97316]" />
                Email me
              </label>
            </div>
            <button onClick={() => post('/api/run', { days, email: emailMe }, 'Fetching releases and summarising…')}
              disabled={!admin || pending}
              className="glow mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium text-ink0 disabled:opacity-40">
              {pending ? 'Working…' : 'Run now'}
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button onClick={() => post('/api/email', undefined, 'Sending…')} disabled={!admin || pending}
                className="rounded-xl border border-line bg-ink3 px-3 py-2 text-xs hover:bg-ink2 disabled:opacity-40">
                Email me this digest
              </button>
              <a href="/api/report?days=7&format=csv"
                className="rounded-xl border border-line bg-ink3 px-3 py-2 text-center text-xs hover:bg-ink2">
                Export CSV
              </a>
            </div>
            {!admin && <p className="mt-2 text-xs text-muted">Log in as admin to run, email or export.</p>}
            {msg && <p className="mt-2 text-xs text-accent">{msg}</p>}
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Repositories watched</h2>
              <Link href="/repos" className="text-xs text-accent hover:underline">Manage →</Link>
            </div>
            <div className="mt-3 flex items-baseline gap-4">
              <div><div className="text-2xl font-semibold">{repoCount}</div><div className="text-xs text-muted">tracked</div></div>
              <div><div className="text-2xl font-semibold">{evaluatingCount}</div><div className="text-xs text-muted">evaluating</div></div>
            </div>
            <Link href="/repos"
              className="mt-3 block rounded-xl border border-dashed border-line px-3 py-2 text-center text-xs text-muted hover:border-accent hover:text-accent">
              + Add repositories (paste many links at once)
            </Link>
          </section>

          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Download a report</h2>
              <Link href="/report" className="text-xs text-accent hover:underline">All →</Link>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              {[1, 7, 30].map((d) => (
                <a key={d} href={`/api/report?days=${d}&format=html`} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-line bg-ink3 px-2 py-2 text-center hover:bg-ink2">{d}d</a>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">HTML prints to PDF · CSV opens in Excel</p>
          </section>

          <section className="card p-4">
            <h2 className="text-sm font-semibold">Recent checks</h2>
            <PastList past={past} />
          </section>

          {digest && (
            <section className="card p-4 text-xs text-muted">
              AI cost this run <span className="text-fg">₹{digest.cost.inr}</span> ·{' '}
              {(digest.cost.input_tokens + digest.cost.output_tokens).toLocaleString()} tokens ·{' '}
              <Link href="/quality" className="text-accent hover:underline">classifier quality →</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------- pieces ---------- */

function Tile({ label, value, hint, dot, accent, active, onClick }: {
  label: string; value: number; hint?: string; dot?: string; accent?: boolean;
  active?: boolean; onClick?: () => void;
}) {
  return (
    <button onClick={onClick}
      className={`card card-hover p-3 text-left ${active ? 'border-accent/60' : ''}`}>
      <div className="flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? 'text-accent' : ''}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </button>
  );
}

/** Share of the window by priority. 2px gaps between segments, labels on the tiles above. */
function PriorityBar({ counts, onPick }: { counts: Record<string, number>; onPick: (p: string) => void }) {
  const total = PRIORITIES.reduce((n, p) => n + (counts[p] ?? 0), 0);
  if (!total) return null;
  return (
    <div className="mt-3 flex h-2 gap-[2px] overflow-hidden rounded-full">
      {PRIORITIES.map((p) => {
        const n = counts[p] ?? 0;
        if (!n) return null;
        return (
          <button key={p} onClick={() => onPick(p)} title={`${priorityLabel(p)}: ${n}`}
            aria-label={`${priorityLabel(p)}: ${n} releases`}
            style={{ width: `${(n / total) * 100}%`, background: PRIORITY_HEX[p] }}
            className="h-full first:rounded-l-full last:rounded-r-full" />
        );
      })}
    </div>
  );
}

function Mini({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="font-semibold">
        {value}{' '}
        {delta != null && <span className="text-[11px] font-normal text-muted">{delta >= 0 ? `+${delta}` : delta}</span>}
      </dd>
    </div>
  );
}

/** 90 days, one mark per 2-day bucket, anchored to when the digest was generated. */
function Timeline({ dates, anchor }: { dates: string[]; anchor: number }) {
  return (
    <div className="mt-3">
      <p className="text-[11px] text-muted">90-day release cadence</p>
      <div className="mt-1 flex h-4 items-end gap-[2px]">
        {Array.from({ length: 45 }, (_, i) => {
          const from = anchor - (45 - i) * 2 * 86400000;
          const hit = dates.some((d) => {
            const t = new Date(d).getTime();
            return t >= from && t < from + 2 * 86400000;
          });
          return <span key={i} className={`w-full rounded-[1px] ${hit ? 'h-3 bg-accent' : 'h-1 bg-line'}`} />;
        })}
      </div>
    </div>
  );
}

function PastList({ past }: { past: PastRow[] }) {
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();
  const latest: PastRow[] = [], rest: PastRow[] = [];
  for (const d of past) {
    // Neon returns timestamptz as a Date, not a string — normalise before slicing.
    const k = new Date(d.created_at).toISOString().slice(0, 10);
    (seen.has(k) ? rest : latest).push(d);
    seen.add(k);
  }
  const label = (k: string) => k === 'weekly' ? 'Monday auto-run' : k === 'daily-security' ? 'Daily security' : 'Run now';
  const row = (d: PastRow) => (
    <li key={d.id} className="py-2">
      <div className="flex justify-between gap-2 text-sm">
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
      <ul className="mt-1 divide-y divide-line">{latest.map(row)}</ul>
      {!!rest.length && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-xs text-accent hover:underline">
          {open ? 'Hide' : `${rest.length} earlier run${rest.length > 1 ? 's' : ''}`}
        </button>
      )}
      {open && <ul className="divide-y divide-line opacity-70">{rest.map(row)}</ul>}
    </>
  );
}

function RepoGroup({ repo, rows }: { repo: string; rows: DigestPayload['items'] }) {
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 3);
  return (
    <div className="card mb-2">
      {shown.map((i) => <ReleaseCard key={i.tag} item={i as unknown as CardItem} compact />)}
      {rows.length > 3 && (
        <button onClick={() => setOpen(!open)} className="px-3 py-2 text-xs text-accent hover:underline">
          {open ? 'Show less' : `Show ${rows.length - 3} more from ${repo}`}
        </button>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted">{children}</p>;
}
