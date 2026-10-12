'use client';
import { useState, useTransition } from 'react';
import Chip from './Chip';

export interface RepoRow {
  id: number; owner: string; name: string; category: 'dependency' | 'evaluating';
  why: string | null; active: boolean;
}
export interface Member { id: number; name: string; email: string; role: string | null }

export default function ReposManager({
  repos, team, admin, errors,
}: { repos: RepoRow[]; team: Member[]; admin: boolean; errors: Record<string, string> }) {
  const [text, setText] = useState('');
  const [category, setCategory] = useState<'dependency' | 'evaluating'>('dependency');
  const [why, setWhy] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  const reload = () => setTimeout(() => location.reload(), 900);

  function add() {
    start(async () => {
      setMsg('Validating each repo against api.github.com…');
      const res = await fetch('/api/repos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, category, why: why || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? 'Failed'); return; }
      const bad = (j.results ?? []).filter((r: { status: string }) => r.status === 'not_found' || r.status === 'invalid');
      setMsg(`${j.message}${bad.length ? ` — not found: ${bad.map((b: { raw: string }) => b.raw).join(', ')}` : ''}`);
      setText(''); reload();
    });
  }

  function patch(id: number, body: Record<string, unknown>) {
    start(async () => {
      const res = await fetch(`/api/repos/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (res.ok) reload(); else setMsg('Failed — are you logged in as admin?');
    });
  }

  function del(r: RepoRow) {
    if (!confirm(`Stop tracking ${r.owner}/${r.name}? Its releases and tickets are deleted too.`)) return;
    start(async () => {
      const res = await fetch(`/api/repos/${r.id}`, { method: 'DELETE' });
      if (res.ok) reload(); else setMsg('Failed');
    });
  }

  const groups: [string, RepoRow[]][] = [
    ['Dependencies', repos.filter((r) => r.category === 'dependency')],
    ['Evaluating', repos.filter((r) => r.category === 'evaluating')],
  ];

  return (
    <div className="space-y-4">
      {admin && (
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Add repositories</h2>
          <p className="text-xs text-muted">
            Paste several GitHub links or <code>owner/name</code> values — separated by spaces, commas or new lines.
            Each one is checked live against the GitHub API and saved with its canonical name.
          </p>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={3}
            placeholder={'https://github.com/stripe/stripe-node\nhonojs/hono, vercel/next.js'}
            className="mt-2 w-full rounded-lg border border-line p-2 font-mono text-xs"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <select value={category} onChange={(e) => setCategory(e.target.value as 'dependency' | 'evaluating')}
              className="rounded border border-line bg-white px-2 py-1">
              <option value="dependency">dependency</option>
              <option value="evaluating">evaluating</option>
            </select>
            <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why do you track these?"
              className="min-w-[12rem] flex-1 rounded border border-line px-2 py-1" />
            <button onClick={add} disabled={pending || !text.trim()}
              className="rounded-lg bg-ink px-3 py-1.5 text-white disabled:opacity-40">
              {pending ? 'Working…' : 'Add'}
            </button>
          </div>
          {msg && <p className="mt-2 text-xs">{msg}</p>}
        </section>
      )}

      {groups.map(([label, rows]) => (
        <section key={label} className="card">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{label} ({rows.length})</h2>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const full = `${r.owner}/${r.name}`;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <img src={`https://github.com/${r.owner}.png?size=40`} alt="" className="h-6 w-6 rounded-full" />
                  <a href={`https://github.com/${full}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">{full}</a>
                  <Chip label={r.category} tone="muted" />
                  {!r.active && <Chip label="paused" tone="muted" />}
                  <span className="text-xs text-muted">{r.why}</span>
                  {errors[full] && <span className="text-xs text-high">⚠ {errors[full]}</span>}
                  {admin && (
                    <span className="ml-auto flex gap-2 text-xs">
                      <button onClick={() => patch(r.id, { category: r.category === 'dependency' ? 'evaluating' : 'dependency' })}
                        className="rounded border border-line px-2 py-1">→ {r.category === 'dependency' ? 'evaluating' : 'dependency'}</button>
                      <button onClick={() => patch(r.id, { active: !r.active })}
                        className="rounded border border-line px-2 py-1">{r.active ? 'Pause' : 'Resume'}</button>
                      <button onClick={() => del(r)} className="rounded border border-line px-2 py-1 text-high">Delete</button>
                    </span>
                  )}
                </li>
              );
            })}
            {!rows.length && <li className="px-4 py-4 text-sm text-muted">None yet.</li>}
          </ul>
        </section>
      ))}

      <TeamPanel team={team} admin={admin} />
    </div>
  );
}

function TeamPanel({ team, admin }: { team: Member[]; admin: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const res = await fetch('/api/team', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role: role || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(j.error ?? 'Failed'); return; }
      location.reload();
    });
  }

  return (
    <section className="card">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Team ({team.length})</h2>
      <ul className="divide-y divide-line">
        {team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
            <span className="font-medium">{m.name}</span>
            <span className="text-muted">{m.email}</span>
            <span className="text-xs text-muted">{m.role}</span>
            {admin && (
              <button
                onClick={() => start(async () => {
                  if (!confirm(`Remove ${m.name}?`)) return;
                  await fetch(`/api/team?id=${m.id}`, { method: 'DELETE' });
                  location.reload();
                })}
                className="ml-auto rounded border border-line px-2 py-1 text-xs text-high">Remove</button>
            )}
          </li>
        ))}
      </ul>
      {admin && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="rounded border border-line px-2 py-1" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" className="rounded border border-line px-2 py-1" />
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded border border-line px-2 py-1" />
          <button onClick={add} disabled={pending || !name || !email}
            className="rounded-lg bg-ink px-3 py-1.5 text-white disabled:opacity-40">Add teammate</button>
          {msg && <span className="text-xs text-high">{msg}</span>}
        </div>
      )}
      <p className="px-4 pb-3 text-xs text-muted">
        Assignment emails reach teammates once a domain is verified in Resend. Until then they are forwarded to DIGEST_TO,
        marked “(intended for …)”, and the fallback is logged in the ticket history.
      </p>
    </section>
  );
}
