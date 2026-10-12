'use client';
import { useState, useTransition } from 'react';
import Chip, { priorityLabel } from './Chip';

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
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—';

export default function ReleaseCard({
  item, ticket, team = [], admin = false, compact = false,
}: {
  item: CardItem; ticket?: CardTicket; team?: TeamOption[]; admin?: boolean; compact?: boolean;
}) {
  const [t, setT] = useState(ticket);
  const [note, setNote] = useState(ticket?.note ?? '');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  function patch(body: Record<string, unknown>) {
    if (!t) return;
    start(async () => {
      const res = await fetch(`/api/tickets/${t.ticket_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(json.error ?? 'Failed'); return; }
      setT({ ...t, ...json.ticket });
      setMsg(json.email ?? 'Saved');
      setTimeout(() => setMsg(''), 4000);
    });
  }

  const chips = [
    ...item.flags,
    ...(item.bump === 'MAJOR' && !item.flags.includes('BREAKING') ? ['MAJOR'] : []),
    ...(item.prerelease ? ['PRE-RELEASE'] : []),
  ];

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-line py-2 text-sm last:border-0">
        <img src={`https://github.com/${item.owner}.png?size=40`} alt="" className="h-5 w-5 rounded-full" />
        <span className="font-medium">{item.repo}</span>
        <span className="text-muted">{item.tag}</span>
        <span className="text-muted">{day(item.published_at)}</span>
        {chips.map((c) => <Chip key={c} label={c} />)}
        <Chip label={priorityLabel(item.priority)} tone={item.priority} />
        {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto text-xs underline">notes →</a>}
      </div>
    );
  }

  return (
    <article className="card p-4">
      <header className="flex flex-wrap items-center gap-2">
        <img src={`https://github.com/${item.owner}.png?size=80`} alt="" className="h-6 w-6 rounded-full" />
        <span className="font-semibold">{item.repo}</span>
        <Chip label={item.category === 'evaluating' ? 'evaluating' : 'dependency'} tone="muted" />
        <span className="text-sm text-muted">{item.tag} · {day(item.published_at)}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {chips.map((c) => <Chip key={c} label={c} />)}
          <Chip label={priorityLabel(item.priority)} tone={item.priority} />
        </span>
      </header>

      <p className="mt-3 text-sm">
        <span className="text-muted">Why this colour? </span>
        {item.why || '—'}
        {item.confidence != null && item.priority === 'NOT_SURE' && (
          <span className="text-muted"> (confidence {item.confidence})</span>
        )}
      </p>

      {!!item.summary?.length && (
        <ul className="mt-2 list-disc pl-5 text-sm">
          {item.summary.slice(0, 2).map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      )}

      {t && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-sm">
          <select
            className="rounded border border-line bg-white px-2 py-1 disabled:opacity-50"
            value={t.assignee_id ?? ''} disabled={!admin || pending}
            onChange={(e) => patch({ assignee_id: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Unassigned</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select
            className="rounded border border-line bg-white px-2 py-1 disabled:opacity-50"
            value={t.status} disabled={!admin || pending}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input
            className="min-w-[12rem] flex-1 rounded border border-line px-2 py-1 disabled:opacity-50"
            placeholder="Add a note…" value={note} disabled={!admin || pending}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (t.note ?? '') && patch({ note })}
          />
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="text-xs underline">
              View release notes →
            </a>
          )}
        </div>
      )}

      {(msg || t?.history?.length) && (
        <p className="mt-2 text-xs text-muted">
          {msg || (t!.history![0] &&
            `${t!.history![0].detail ?? t!.history![0].action} by ${t!.history![0].by_name ?? 'admin'} · ${ago(t!.history![0].at)}`)}
        </p>
      )}
      {!t && item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">
          View release notes →
        </a>
      )}
    </article>
  );
}
