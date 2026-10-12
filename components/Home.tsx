'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import Chip, { priorityLabel, PRIORITY_HEX } from './Chip';
import ReleaseCard, { type CardItem, type CardTicket, type TeamOption } from './ReleaseCard';
import CountUp from './CountUp';
import FlowButton from './FlowButton';
import Assistant from './Assistant';
import type { DigestPayload } from '@/lib/pipeline';
import type { TicketRow } from '@/lib/queries';
import type { Match } from '@/lib/manifest';
import RulesTab, { type RulesPayload } from './RulesTab';

type Tab = 'needs' | 'fixed' | 'all' | 'evaluating' | 'quiet' | 'rules';
type Sort = 'newest' | 'oldest' | 'high' | 'low';

const SORTS: [Sort, string][] = [
  ['high', 'Priority: high → low'],
  ['low', 'Priority: low → high'],
  ['newest', 'Date: newest first'],
  ['oldest', 'Date: oldest first'],
];
const RANK: Record<string, number> = { HIGH: 0, MEDIUM: 1, NOT_SURE: 2, LOW: 3 };

/** One comparator for tickets and digest items alike — both carry priority + published_at. */
function sorter<T extends { priority: string; published_at?: string | null }>(mode: Sort) {
  const date = (x: T) => new Date(x.published_at ?? 0).getTime();
  return (a: T, b: T) => {
    if (mode === 'newest') return date(b) - date(a);
    if (mode === 'oldest') return date(a) - date(b);
    const r = (RANK[a.priority] ?? 9) - (RANK[b.priority] ?? 9);
    if (r !== 0) return mode === 'high' ? r : -r;
    return date(b) - date(a); // within a priority, newest first
  };
}
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
  digest, needs, fixed, team, past, admin, events, nextRun, repoCount, evaluatingCount, greeting,
  matches, manifestCount, rules,
}: {
  digest: DigestPayload | null; needs: TicketRow[]; fixed: TicketRow[]; team: TeamOption[];
  past: PastRow[]; admin: boolean;
  events: Record<number, { at: string; by_name: string | null; action: string; detail: string | null }[]>;
  nextRun: string; repoCount: number; evaluatingCount: number;
  greeting: { hello: string; when: string };
  matches: Record<number, Match>;
  manifestCount: number;
  rules: RulesPayload;
}) {
  const [tab, setTab] = useState<Tab>('needs');
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('high');
  const [owner, setOwner] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [days, setDays] = useState(7);
  const [emailMe, setEmailMe] = useState(true);
  const [msg, setMsg] = useState('');
  const [stage, setStage] = useState('');
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

  const byOwner = (rows: TicketRow[]) =>
    owner === 'all' ? rows
      : owner === 'unassigned' ? rows.filter((n) => !n.assignee_id)
      : rows.filter((n) => !!n.assignee_id);
  const byImpact = (rows: TicketRow[]) =>
    onlyMine ? rows.filter((n) => matches[n.ticket_id]?.kind === 'affects') : rows;

  const visibleNeeds = byImpact(byOwner(filter ? needs.filter((n) => n.priority === filter) : needs))
    .slice().sort(sorter(sort));
  const assignedCount = needs.filter((n) => !!n.assignee_id).length;
  const affectsCount = needs.filter((n) => matches[n.ticket_id]?.kind === 'affects').length;
  const visibleFixed = fixed.slice().sort(sorter(sort));
  const topHigh = needs.filter((n) => n.priority === 'HIGH').slice(0, 3);

  const grouped = useMemo(() => {
    const src = filter ? items.filter((i) => i.priority === filter) : items;
    return PRIORITIES.map((p) => {
      const rows = src.filter((i) => i.priority === p).slice().sort(sorter(sort));
      const byRepo = new Map<string, typeof rows>();
      rows.forEach((i) => byRepo.set(i.repo, [...(byRepo.get(i.repo) ?? []), i]));
      return { priority: p, repos: [...byRepo.entries()] };
    }).filter((g) => g.repos.length);
  }, [items, filter, sort]);

  /**
   * Take her to the actual release, not to a filtered list she is already looking
   * at. Clears every filter that could hide the target first, then scrolls to the
   * card and flashes it so the jump is visible.
   */
  function goToTicket(ticketId: number) {
    setTab('needs'); setFilter(null); setOwner('all'); setOnlyMine(false);
    // two frames: one for React to commit the tab switch, one for layout
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`ticket-${ticketId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1900);
    }));
  }

  /** Insights name a priority, not one release — filter, then show the list. */
  function goToPriority(priority: string) {
    const p = priority === 'LOW' ? null : priority;
    setFilter(p); setTab(p ? 'needs' : 'all'); setOwner('all'); setOnlyMine(false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.getElementById('release-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }

  function post(url: string, body?: unknown, label = 'Working…') {
    // A run takes ~40-160s, so narrate it instead of leaving a dead button.
    const steps = url === '/api/run'
      ? ['Reading your repositories…', 'Fetching releases from GitHub…', 'Applying security rules…',
         'Asking Gemini to summarise…', 'Scoring priorities…', 'Saving the digest…']
      : ['Sending…'];
    let i = 0;
    setStage(steps[0]);
    const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setStage(steps[i]); }, 6000);
    start(async () => {
      setMsg(label);
      const res = await fetch(url, {
        method: 'POST',
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      });
      const j = await res.json().catch(() => ({}));
      clearInterval(timer); setStage('');
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
    ['rules', 'Rules', rules.security_terms.length + rules.breaking_terms.length + rules.ignore_terms.length],
  ];

  return (
    <div className="space-y-5">
      {digest?.ai_banner && (
        <p className="card border-medium/40 bg-medium/10 px-4 py-2 text-sm text-medium">{digest.ai_banner}</p>
      )}

      {/* ---- greeting ---- */}
      <header className="rise">
        <h1 className="shimmer text-2xl font-semibold tracking-tight sm:text-3xl">{greeting.hello}</h1>
        <p className="mt-1 text-sm text-muted">
          {greeting.when} ·{' '}
          {need > 0
            ? <>{need} release{need > 1 ? 's' : ''} waiting on you{queue.HIGH ? <>, {queue.HIGH} marked high</> : null}.</>
            : <>nothing urgent — everything tracked shipped routine updates.</>}
        </p>
      </header>

      {/* ---- key metrics: each tile filters the lists below ---- */}
      <section aria-label="Key metrics" className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Need attention" value={need} hint={`${unassigned} unassigned`} accent
          onClick={() => { setFilter(null); setTab('needs'); }} active={!filter && tab === 'needs'} />
        {PRIORITIES.map((p) => (
          <Tile key={p} label={priorityLabel(p)} value={queue[p] ?? 0}
            dot={PRIORITY_HEX[p]} active={filter === p}
            hint={p === 'HIGH' ? 'open · security / breaking' : p === 'MEDIUM' ? 'open · plan upgrade' : p === 'LOW' ? 'routine, no ticket' : 'open · low confidence'}
            onClick={() => { setFilter(filter === p ? null : p); setTab(p === 'LOW' ? 'all' : 'needs'); }} />
        ))}
        {manifestCount > 0 ? (
          <Tile label="Affects you" value={affectsCount} accent
            hint={`of ${manifestCount} deps you ship`} active={onlyMine}
            onClick={() => { setOnlyMine(!onlyMine); setTab('needs'); }} />
        ) : (
          <Tile label="Quiet repos" value={counts.quiet} hint={`of ${repoCount} tracked`}
            onClick={() => { setFilter(null); setTab('quiet'); }} active={tab === 'quiet'} />
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ---- focus + tabs ---- */}
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <section className="card card-settle rise p-5" style={{ animationDelay: '.1s' }}>
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
                <ul className="mt-2 space-y-1">
                  {digest.briefing.slice(0, 5).map((b, i) => (
                    <li key={i}>
                      <button
                        onClick={() => goToPriority(b.priority)}
                        className="group flex w-full items-start gap-2.5 rounded-xl border border-transparent
                          bg-ink0/40 px-2.5 py-2 text-left text-sm
                          transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
                          hover:border-accent/30 hover:bg-ink3">
                        <span className="mt-[1px] shrink-0"><Chip label={priorityLabel(b.priority)} tone={b.priority} /></span>
                        <span className="min-w-0 flex-1">{b.text}</span>
                        <span className="mt-[2px] shrink-0 text-accent opacity-40
                          transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]
                          group-hover:translate-x-1 group-hover:opacity-100">→</span>
                      </button>
                    </li>
                  ))}
                </ul>

                {!!topHigh.length && (
                  <div className="mt-4 border-t border-line pt-3">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Start here</h2>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {topHigh.map((t) => (
                        <FlowButton key={t.ticket_id} size="sm" text={t.repo} sub={t.tag}
                          dot={PRIORITY_HEX[t.priority]}
                          onClick={() => goToTicket(t.ticket_id)} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          <section id="release-list" className="rise scroll-mt-20" style={{ animationDelay: '.16s' }}>
            {/* folder tabs: the active one is the same surface as the panel and
                overlaps its top border by 1px, so the two read as one sheet */}
            <div className="no-print scroll-x flex items-end gap-1 overflow-x-auto pl-3">
              {TABS.map(([k, label, n]) => {
                const on = tab === k;
                return (
                  <button key={k} onClick={() => setTab(k)} aria-current={on ? 'page' : undefined}
                    className={`relative -mb-px shrink-0 whitespace-nowrap rounded-t-xl px-4 py-2.5 text-sm transition-colors
                      ${on
                        ? 'z-10 border border-line border-b-ink2 bg-ink2 font-medium text-fg'
                        : 'border border-transparent text-muted hover:bg-ink1 hover:text-fg'}`}>
                    {label}
                    <span className={`ml-1.5 rounded-full px-1.5 py-[1px] text-[11px] tabular-nums
                      ${on ? 'bg-accent/15 text-accent' : 'bg-ink3 text-muted'}`}>{n}</span>
                  </button>
                );
              })}
            </div>

            <div className="card card-settle rounded-tl-none">
              {/* controls get their own full-width row instead of crowding the tabs */}
              {(tab === 'needs' || tab === 'fixed' || tab === 'all') && (
                <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
                  {tab === 'needs' && (
                    <div className="flex items-center gap-1 rounded-lg border border-line bg-ink0 p-0.5 text-xs">
                      {([
                        ['all', `All ${needs.length}`],
                        ['unassigned', `Unassigned ${unassigned}`],
                        ['assigned', `Assigned ${assignedCount}`],
                      ] as const).map(([v, l]) => (
                        <button key={v} onClick={() => setOwner(v)}
                          className={`rounded-md px-2.5 py-1 transition ${owner === v ? 'bg-ink3 text-fg' : 'text-muted hover:text-fg'}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}

                  {tab === 'needs' && manifestCount > 0 && (
                    <button onClick={() => setOnlyMine(!onlyMine)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs transition ${
                        onlyMine ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}>
                      {onlyMine ? '✓ ' : ''}Only what affects me
                    </button>
                  )}

                  {filter && (
                    <button onClick={() => setFilter(null)}
                      className="rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-xs text-accent hover:bg-accent/20">
                      {priorityLabel(filter)} ✕
                    </button>
                  )}

                  <label className="ml-auto flex items-center gap-1.5 text-xs text-muted">
                    <span className="hidden sm:inline">Sort</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                      aria-label="Sort releases"
                      className="rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-xs text-fg focus:border-accent focus:outline-none">
                      {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                </div>
              )}

            <div className="space-y-3 p-3">
              {tab === 'needs' && (visibleNeeds.length ? visibleNeeds.map((t) => (
                <div key={t.ticket_id} id={`ticket-${t.ticket_id}`} className="scroll-mt-24 rounded-2xl">
                  <ReleaseCard item={toCard(t)} ticket={ticketOf(t)} team={team}
                    admin={admin} match={matches[t.ticket_id]} />
                </div>
              )) : <Empty>
                {!needs.length ? 'Inbox zero — nothing open.'
                  : owner === 'unassigned' ? 'Nothing unassigned — every open item has an owner.'
                  : onlyMine ? 'Nothing open affects the versions in your package.json.'
                  : owner === 'assigned' ? 'Nothing assigned yet. Pick a teammate on a card to hand it over.'
                  : 'Nothing matches that filter.'}
              </Empty>)}

              {tab === 'fixed' && (visibleFixed.length ? visibleFixed.map((t) => (
                <div key={t.ticket_id}>
                  <ReleaseCard item={toCard(t)} ticket={ticketOf(t)} team={team} admin={admin}
                    match={matches[t.ticket_id]} />
                  <div className="flex flex-wrap items-center gap-2 px-4 pt-1.5 text-xs text-muted">
                    <span>
                      {t.status === 'fixed' ? 'Fixed' : 'Dismissed'} by {t.updated_by ?? 'admin'}
                      {t.fixed_at ? ` · ${new Date(t.fixed_at).toLocaleDateString('en-GB')}` : ''}
                    </span>
                    {admin && <Reopen ticketId={t.ticket_id} />}
                  </div>
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
                    <article key={e.repo} className="card card-glow card-sheen p-4">
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

              {tab === 'rules' && <RulesTab initial={rules} admin={admin} />}

              {tab === 'all' && !!counts.prerelease_hidden && (
                <p className="px-2 text-xs text-muted">{counts.prerelease_hidden} pre-releases hidden (none flagged).</p>
              )}
              {tab === 'all' && !!digest?.errors.length && (
                <ul className="px-2 text-xs text-high">
                  {digest.errors.map((e) => <li key={e.repo}>{e.repo}: {e.error}</li>)}
                </ul>
              )}
              </div>
            </div>
          </section>
        </div>

        {/* ---- actions sidebar ---- */}
        <aside className="no-print space-y-4 rise" style={{ animationDelay: '.2s' }}>
          <section className="card card-settle p-4">
            <h2 className="text-sm font-semibold">Run a check</h2>
            <p className="mt-1 text-xs text-muted">Runs automatically every Monday 08:00 IST. {nextRun}.</p>
            {admin ? (
              <>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} disabled={pending}
                    aria-label="Window"
                    className="rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-fg disabled:cursor-wait disabled:opacity-70">
                    {[1, 7, 14, 30].map((d) => <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={emailMe} disabled={pending}
                      onChange={(e) => setEmailMe(e.target.checked)} className="accent-[#F97316]" />
                    Email me
                  </label>
                </div>
                <div className="mt-3">
                  <FlowButton full text="Run now" pendingText="Running…" pending={pending}
                    onClick={() => post('/api/run', { days, email: emailMe }, 'Fetching releases and summarising…')} />
                </div>
                {pending && stage && (
                  <p className="fade mt-2 text-center text-xs text-accent" aria-live="polite">{stage}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <FlowButton size="sm" text="Email digest" pendingText="Sending…" pending={pending}
                    onClick={() => post('/api/email', undefined, 'Sending…')} />
                  <FlowButton size="sm" text="Export CSV" href="/api/report?days=7&format=csv" />
                </div>
              </>
            ) : (
              <Link href="/login"
                className="glow mt-3 block w-full rounded-xl px-3 py-2.5 text-center text-sm font-semibold text-ink0">
                Unlock to run, email &amp; export
              </Link>
            )}
            {!admin && <p className="mt-2 text-xs text-muted">Log in as admin to run, email or export.</p>}
            {msg && <p className="mt-2 text-xs text-accent">{msg}</p>}
          </section>

          <section className="card card-settle p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Repositories watched</h2>
              <Link href="/repos" className="shrink-0 text-xs text-accent hover:underline">Manage →</Link>
            </div>
            <p className="mt-1 text-xs text-muted">
              See exactly which repositories are being checked each run, pause or remove any of them,
              and add more — no code changes, no redeploy.
            </p>
            <div className="mt-3 flex items-baseline gap-4">
              <div><div className="text-2xl font-semibold">{repoCount}</div><div className="text-xs text-muted">tracked</div></div>
              <div><div className="text-2xl font-semibold">{evaluatingCount}</div><div className="text-xs text-muted">evaluating</div></div>
            </div>
            <Link href="/repos"
              className="lift mt-3 block rounded-xl border border-dashed border-[#4A4039] px-3 py-2.5 text-center text-xs text-muted hover:border-accent hover:text-accent">
              + Add repositories
              <span className="mt-0.5 block text-[11px] opacity-80">paste several GitHub links at once</span>
            </Link>
          </section>

          <section className="card card-settle p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Download a report</h2>
              <Link href="/report" className="text-xs text-accent hover:underline">All →</Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 7, 30].map((d) => (
                <FlowButton key={d} size="sm" text={`${d}d`} newTab
                  href={`/api/report?days=${d}&format=html`} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">HTML prints to PDF · CSV opens in Excel</p>
          </section>

          <section className="card card-settle p-4">
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

      <Assistant need={need} />
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
      className={`card card-glow card-sheen p-3 text-left ${active ? 'border-accent/60' : ''}`}>
      <div className="flex items-center gap-1.5">
        {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
        <span className="text-[11px] uppercase tracking-wider text-muted">{label}</span>
      </div>
      <div className={`mt-1 text-2xl font-semibold ${accent ? 'text-accent' : ''}`}>
        <CountUp to={value} />
      </div>
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

/** §7: the Fixed tab needs a one-click way back to Open. */
function Reopen({ ticketId }: { ticketId: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr('');
          const res = await fetch(`/api/tickets/${ticketId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'open' }),
          });
          if (res.ok) location.reload();
          else { setErr('Could not reopen'); setBusy(false); }
        }}
        className="rounded-lg border border-[#4A4039] px-2 py-1 text-xs text-fg transition hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-70">
        {busy ? 'Reopening…' : '↺ Reopen'}
      </button>
      {err && <span className="text-high">{err}</span>}
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-8 text-center text-sm text-muted">{children}</p>;
}
