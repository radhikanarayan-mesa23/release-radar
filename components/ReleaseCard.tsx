'use client';
import { useState, useTransition } from 'react';
import Chip, { priorityLabel } from './Chip';
import type { Match } from '@/lib/manifest';

export interface CardTicket {
  ticket_id: number; status: string; assignee_id: number | null; assignee: string | null;
  note: string | null; updated_by: string | null; updated_at: string | null; fixed_at: string | null;
  history?: { at: string; by_name: string | null; action: string; detail: string | null }[];
}
export interface CardItem {
  repo: string; owner: string; category: string; tag: string;
  url?: string | null; published_at?: string | null; priority: string;
  flags: string[]; bump?: string | null; prerelease?: boolean;
  summary?: string[] | null; why?: string | null; confidence?: number | null;
}
export interface TeamOption { id: number; name: string }

const STATUSES = [
  ['open', 'Open'], ['in_progress', 'In progress'], ['fixed', 'Fixed'], ['dismissed', 'Dismissed'],
] as const;

const ago = (iso?: string | null) => {
  if (!iso) return '';
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3.6e6);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

const BAR: Record<string, string> = {
  HIGH: 'bg-high', MEDIUM: 'bg-medium', LOW: 'bg-low', NOT_SURE: 'bg-notsure',
};

export default function ReleaseCard({
  item, ticket, team = [], admin = false, compact = false, match,
}: {
  item: CardItem; ticket?: CardTicket; team?: TeamOption[]; admin?: boolean;
  compact?: boolean; match?: Match;
}) {
  const [t, setT] = useState(ticket);
  const [note, setNote] = useState(ticket?.note ?? '');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  function patch(body: Record<string, unknown>) {
    if (!t) return;
    start(async () => {
      const res = await fetch(`/api/tickets/${t.ticket_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error ?? 'Failed'); return; }
      setT({ ...t, ...json.ticket });
      setMsg(json.email ?? 'Saved');
      setTimeout(() => setMsg(''), 5000);
    });
  }

  const chips = [
    ...item.flags,
    ...(item.bump === 'MAJOR' && !item.flags.includes('BREAKING') ? ['MAJOR'] : []),
    ...(item.prerelease ? ['PRE-RELEASE'] : []),
  ];

  if (compact) {
    return (
      <a href={item.url ?? '#'} target="_blank" rel="noreferrer"
        className="card-hover flex flex-wrap items-center gap-2 border-b border-line/60 px-3 py-2 text-sm last:border-0">
        <span className={`h-5 w-[3px] shrink-0 rounded-full ${BAR[item.priority] ?? 'bg-low'}`} />
        <img src={`https://github.com/${item.owner}.png?size=40`} alt="" className="h-5 w-5 rounded-full" />
        <span className="font-medium">{item.repo}</span>
        <span className="text-muted">{item.tag}</span>
        <span className="text-xs text-muted">{day(item.published_at)}</span>
        {chips.map((c) => <Chip key={c} label={c} />)}
        <span className="ml-auto text-xs text-muted">open ↗</span>
      </a>
    );
  }

  return (
    <article className="card overflow-hidden">
      <div className="flex">
        <div className={`w-[3px] shrink-0 ${BAR[item.priority] ?? 'bg-low'}`} aria-hidden />
        <div className="min-w-0 flex-1 p-4">
          <header className="flex flex-wrap items-center gap-2">
            <img src={`https://github.com/${item.owner}.png?size=80`} alt="" className="h-7 w-7 rounded-full" />
            <a href={item.url ?? '#'} target="_blank" rel="noreferrer"
              className="font-semibold hover:text-accent">
              {item.repo} <span className="font-normal text-muted">{item.tag}</span>
            </a>
            <Chip label={item.category === 'evaluating' ? 'evaluating' : 'dependency'} tone="muted" />
            <span className="text-xs text-muted">{day(item.published_at)}</span>
            {t?.assignee
              ? <Chip label={`→ ${t.assignee}`} tone="accent" />
              : t && <Chip label="unassigned" tone="muted" />}
            <span className="ml-auto flex flex-wrap items-center gap-1">
              {chips.map((c) => <Chip key={c} label={c} />)}
              <Chip label={priorityLabel(item.priority)} tone={item.priority} />
            </span>
          </header>

          {match && match.kind !== 'unknown' && (
            <p className="mt-2 text-sm">
              {match.kind === 'affects' && (
                <span className="text-high">
                  <b>Affects you.</b>{' '}
                  <span className="text-fg">
                    You have <code className="text-accent">{match.package}@{match.range}</code> —{' '}
                    {match.behind ? `a ${match.behind} behind` : 'older than'} {item.tag}.
                  </span>
                </span>
              )}
              {match.kind === 'covered' && (
                <span className="text-muted">
                  <b className="text-low">Already covered.</b> Your range{' '}
                  <code>{match.package}@{match.range}</code> allows this.
                </span>
              )}
              {match.kind === 'absent' && (
                <span className="text-muted">Not in your package.json — informational only.</span>
              )}
            </p>
          )}
          <p className="mt-3 text-sm">
            <span className="text-muted">Why this colour? </span>{item.why || '—'}
            {item.confidence != null && item.priority === 'NOT_SURE' && (
              <span className="text-muted"> (confidence {item.confidence})</span>
            )}
          </p>

          {!!item.summary?.length && (
            <ul className="mt-2 space-y-1 text-sm text-fg/90">
              {item.summary.slice(0, 2).map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" />{s}
                </li>
              ))}
            </ul>
          )}

          {t && (admin ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
              <select aria-label="Assignee" value={t.assignee_id ?? ''} disabled={pending}
                onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null })}
                className="rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-sm text-fg disabled:cursor-wait disabled:opacity-70">
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <select aria-label="Status" value={t.status} disabled={pending}
                onChange={(e) => patch({ status: e.target.value })}
                className="rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-sm text-fg disabled:cursor-wait disabled:opacity-70">
                {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <input value={note} disabled={pending} placeholder="Add a note…"
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (t.note ?? '') && patch({ note })}
                className="min-w-[10rem] flex-1 rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-wait disabled:opacity-70" />
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer"
                  className="rounded-lg border border-[#4A4039] px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent">
                  Release notes ↗
                </a>
              )}
            </div>
          ) : (
            /* Locked: show the state as readable text, never ghosted-out controls. */
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
              <span className="rounded-lg border border-line bg-ink3 px-2 py-1.5 text-xs">
                <span className="text-muted">Assignee </span>{t.assignee ?? 'Unassigned'}
              </span>
              <span className="rounded-lg border border-line bg-ink3 px-2 py-1.5 text-xs">
                <span className="text-muted">Status </span>
                {STATUSES.find(([v]) => v === t.status)?.[1] ?? t.status}
              </span>
              {t.note && (
                <span className="rounded-lg border border-line bg-ink3 px-2 py-1.5 text-xs">
                  <span className="text-muted">Note </span>{t.note}
                </span>
              )}
              <a href="/login" className="text-xs text-accent hover:underline">Unlock to assign →</a>
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer"
                  className="ml-auto rounded-lg border border-[#4A4039] px-2 py-1.5 text-xs text-muted hover:border-accent hover:text-accent">
                  Release notes ↗
                </a>
              )}
            </div>
          ))}

          {(msg || !!t?.history?.length) && (
            <p className="mt-2 text-xs text-muted">
              {msg || (t!.history![0] &&
                `${t!.history![0].detail ?? t!.history![0].action} by ${t!.history![0].by_name ?? 'admin'} · ${ago(t!.history![0].at)}`)}
            </p>
          )}
          {!t && item.url && (
            <a href={item.url} target="_blank" rel="noreferrer"
              className="mt-3 inline-block text-xs text-muted hover:text-accent">Release notes ↗</a>
          )}
        </div>
      </div>
    </article>
  );
}
