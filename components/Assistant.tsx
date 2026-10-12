'use client';
import { useRef, useState } from 'react';

interface Msg { role: 'user' | 'model'; text: string }

const SUGGESTED = [
  'What should I do first today?',
  'Summarise the high-priority items',
  'Anything I can safely ignore?',
  'What is still unassigned?',
];

export default function Assistant({ need }: { need: number }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setErr(''); setQ(''); setBusy(true);
    const history = msgs.slice(-6);
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setErr(j.error ?? 'Could not answer that.');
      else setMsgs((m) => [...m, { role: 'model', text: j.answer }]);
    } catch {
      setErr('Network error.');
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Ask the release assistant"
        className="glow lift no-print fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold text-ink0 shadow-xl">
        <Spark /> Ask about this week
        {need > 0 && (
          <span className="rounded-full bg-ink0/25 px-2 py-[1px] text-xs">{need}</span>
        )}
      </button>
    );
  }

  return (
    <div className="no-print fixed bottom-5 right-5 z-40 flex h-[520px] w-[min(92vw,380px)] flex-col rounded-2xl border border-line bg-ink2 shadow-2xl pop">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="glow flex h-7 w-7 items-center justify-center rounded-lg text-ink0"><Spark /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Release assistant</p>
          <p className="truncate text-[11px] text-muted">Gemini Flash · reads only your current digest</p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close assistant"
          className="ml-auto rounded-lg px-2 py-1 text-muted hover:bg-ink3 hover:text-fg">✕</button>
      </header>

      <div className="scroll-y flex-1 space-y-3 p-3">
        {!msgs.length && (
          <div className="fade">
            <p className="text-sm text-muted">
              Ask me anything about this week&apos;s releases. I only read the digest already on
              this dashboard, so I can&apos;t invent a version or a CVE.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => ask(s)}
                  className="lift rounded-xl border border-[#4A4039] bg-ink0 px-3 py-1.5 text-left text-xs hover:border-accent hover:text-accent">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`rise flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'rounded-br-sm bg-accent/20 text-fg'
                : 'rounded-bl-sm border border-line bg-ink0 text-fg'}`}>
              {m.text}
            </p>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <p className="typing rounded-2xl rounded-bl-sm border border-line bg-ink0 px-3 py-2 text-sm text-muted">
              <span>●</span><span>●</span><span>●</span>
            </p>
          </div>
        )}
        {err && <p className="rounded-xl border border-high/40 bg-high/10 px-3 py-2 text-xs text-high">{err}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex items-center gap-2 border-t border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
          placeholder="Ask about this week…" aria-label="Your question"
          className="min-w-0 flex-1 rounded-xl border border-[#4A4039] bg-ink0 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-70" />
        <button type="submit" disabled={busy || !q.trim()}
          className="glow rounded-xl px-3 py-2 text-sm font-semibold text-ink0 disabled:opacity-40">→</button>
      </form>
    </div>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 2.5 13.7 9l6.3 1.7-6.3 1.7L12 19l-1.7-6.6L4 10.7 10.3 9 12 2.5Z" />
    </svg>
  );
}
