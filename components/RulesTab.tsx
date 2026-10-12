'use client';
import { useMemo, useState, useTransition } from 'react';
import Chip, { priorityLabel } from './Chip';
import { applyRules, priorityFromRules, type RuleConfig } from '@/lib/rules';

export interface RulesPayload {
  security_terms: string[]; breaking_terms: string[]; ignore_terms: string[];
  customised: { security: boolean; breaking: boolean; ignore: boolean };
  defaults: { security_terms: string[]; breaking_terms: string[]; ignore_terms: string[] };
}

type ListKey = 'security_terms' | 'breaking_terms' | 'ignore_terms';

const META: Record<ListKey, { title: string; blurb: string; tone: string }> = {
  security_terms: {
    title: 'Marks a release SECURITY',
    blurb: 'Matched line by line against the release notes. Any hit flags the release and sends it to HIGH.',
    tone: 'HIGH',
  },
  breaking_terms: {
    title: 'Marks a release BREAKING',
    blurb: 'Matched against the whole body, not line by line — “migration guide in docs” still counts. A major version bump also flags BREAKING on its own.',
    tone: 'MEDIUM',
  },
  ignore_terms: {
    title: 'Lines that never count as security',
    blurb: 'Any line matching these is dropped before the security check. This is what keeps “chore(examples): fix RCE” routine instead of red.',
    tone: 'LOW',
  },
};

const SAMPLE = 'Fixes CVE-2026-31337: webhook signature verification could be bypassed.\nchore(examples): bump next in /examples to fix RCE (CVE-2025-29927).';

export default function RulesTab({ initial, admin }: { initial: RulesPayload; admin: boolean }) {
  const [lists, setLists] = useState({
    security_terms: initial.security_terms,
    breaking_terms: initial.breaking_terms,
    ignore_terms: initial.ignore_terms,
  });
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();

  // live tester
  const [body, setBody] = useState(SAMPLE);
  const [tag, setTag] = useState('v4.2.1');
  const [prev, setPrev] = useState('v4.2.0');
  const [category, setCategory] = useState<'dependency' | 'evaluating'>('dependency');

  const cfg: RuleConfig = lists;
  const result = useMemo(() => {
    const r = applyRules({ tag, prev_tag: prev, title: tag, body }, cfg);
    return { ...r, priority: priorityFromRules({ ...r, category }) };
  }, [tag, prev, body, category, cfg]);

  function save() {
    start(async () => {
      setMsg('Saving…');
      const res = await fetch('/api/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lists),
      });
      const j = await res.json().catch(() => ({}));
      setMsg(res.ok ? 'Saved — the next run uses these.' : (j.error ?? 'Failed'));
      setTimeout(() => setMsg(''), 6000);
    });
  }

  const resetOne = (k: ListKey) => setLists((l) => ({ ...l, [k]: initial.defaults[k] }));
  const remove = (k: ListKey, t: string) => setLists((l) => ({ ...l, [k]: l[k].filter((x) => x !== t) }));
  const add = (k: ListKey, t: string) => {
    const v = t.trim();
    if (!v || lists[k].includes(v)) return;
    try { new RegExp(v); } catch { setMsg(`"${v}" is not a valid pattern.`); return; }
    setLists((l) => ({ ...l, [k]: [...l[k], v] }));
  };

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h3 className="text-sm font-semibold">How a colour is decided</h3>
        <p className="mt-1 text-xs text-muted">
          Code decides first, the model second. These terms run before Gemini sees anything; Gemini may
          <b className="text-fg"> add</b> a flag it spots, but it can never remove one. Change a term here and the
          next run uses it — nothing is hard-coded in the app.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr>{['Priority', 'When it fires'].map((h) => <th key={h} className="pb-2 pr-4 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[
                ['HIGH', 'A SECURITY flag, or BREAKING on a repo you depend on'],
                ['MEDIUM', 'BREAKING on a repo you are only evaluating, or a minor/major with new features'],
                ['LOW', 'Patches, docs, routine bumps, example-only changes, pre-releases'],
                ['NOT_SURE', 'Gemini confidence under 0.6 and nothing flagged — treated like MEDIUM'],
              ].map(([p, when]) => (
                <tr key={p}>
                  <td className="py-2 pr-4"><Chip label={priorityLabel(p)} tone={p} /></td>
                  <td className="py-2 text-muted">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(Object.keys(META) as ListKey[]).map((k) => (
        <section key={k} className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Chip label={k === 'security_terms' ? 'SECURITY' : k === 'breaking_terms' ? 'BREAKING' : 'IGNORED'}
              tone={META[k].tone} />
            <h3 className="text-sm font-semibold">{META[k].title}</h3>
            <span className="text-xs text-muted">{lists[k].length} terms</span>
            {admin && (
              <button onClick={() => resetOne(k)} className="ml-auto text-xs text-muted underline hover:text-fg">
                reset to default
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">{META[k].blurb}</p>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {lists[k].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5 rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1 font-mono text-xs">
                {t}
                {admin && (
                  <button onClick={() => remove(k, t)} aria-label={`Remove ${t}`}
                    className="text-muted hover:text-high">×</button>
                )}
              </span>
            ))}
            {!lists[k].length && <span className="text-xs text-muted">Empty — the defaults will be used.</span>}
          </div>

          {admin && <AddTerm onAdd={(v) => add(k, v)} />}
        </section>
      ))}

      {admin && (
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={pending}
            className="glow rounded-xl px-4 py-2 text-sm font-semibold text-ink0 disabled:opacity-40">
            {pending ? 'Saving…' : 'Save rubric'}
          </button>
          {msg && <span className="text-xs text-accent">{msg}</span>}
        </div>
      )}

      <section className="card p-4">
        <h3 className="text-sm font-semibold">Try it before you save</h3>
        <p className="mt-1 text-xs text-muted">
          Runs the rules above in your browser — no AI call, no cost. Edit a term and watch the verdict change.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-xs text-muted">Tag
            <input value={tag} onChange={(e) => setTag(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 font-mono text-xs text-fg" />
          </label>
          <label className="text-xs text-muted">Previous tag
            <input value={prev} onChange={(e) => setPrev(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 font-mono text-xs text-fg" />
          </label>
          <label className="text-xs text-muted">Repo is
            <select value={category} onChange={(e) => setCategory(e.target.value as 'dependency' | 'evaluating')}
              className="mt-1 w-full rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 text-xs text-fg">
              <option value="dependency">a dependency</option>
              <option value="evaluating">being evaluated</option>
            </select>
          </label>
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
          className="mt-2 w-full rounded-xl border border-[#4A4039] bg-ink0 p-2 font-mono text-xs text-fg" />

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink0 p-3">
          <Chip label={priorityLabel(result.priority)} tone={result.priority} />
          {result.flags.length
            ? result.flags.map((f) => <Chip key={f} label={f} />)
            : <span className="text-xs text-muted">no flags</span>}
          <span className="text-xs text-muted">bump {result.bump}</span>
          <span className="w-full text-xs text-muted">{result.why}</span>
        </div>
      </section>
    </div>
  );
}

function AddTerm({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); onAdd(v); setV(''); }} className="mt-3 flex gap-2">
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add a word or pattern…"
        className="min-w-0 flex-1 rounded-lg border border-[#4A4039] bg-ink0 px-2 py-1.5 font-mono text-xs text-fg placeholder:text-muted focus:border-accent focus:outline-none" />
      <button type="submit" disabled={!v.trim()}
        className="rounded-lg border border-[#4A4039] px-3 py-1.5 text-xs hover:border-accent disabled:opacity-40">
        Add
      </button>
    </form>
  );
}
