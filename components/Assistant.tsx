'use client';
import { useRef, useState } from 'react';
import FlowButton from './FlowButton';

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
  const [stage, setStage] = useState('');
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setErr(''); setQ(''); setBusy(true);
    const steps = ['Reading this week’s digest…', 'Checking your open tickets…', 'Writing an answer…'];
    let i = 0; setStage(steps[0]);
    const timer = setInterval(() => { i = Math.min(i + 1, steps.length - 1); setStage(steps[i]); }, 2200);
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
      clearInterval(timer); setStage(''); setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Chat with Repository Buddy"
        className="glow lift no-print group fixed bottom-5 right-5 z-40 flex items-center gap-2.5
          rounded-full py-2.5 pl-2.5 pr-4 text-left text-ink0 shadow-xl
          transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:rounded-[18px] active:scale-[0.97]">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink0/20">
          <Bot />
          {need > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ink0 px-1 text-[10px] font-bold text-accent2">
              {need}
            </span>
          )}
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-bold">Repository Buddy</span>
          <span className="block text-[11px] font-medium opacity-80">Ask me about this week</span>
        </span>
      </button>
    );
  }

  return (
    <div className="no-print fixed bottom-5 right-5 z-40 flex h-[520px] w-[min(92vw,380px)] flex-col rounded-2xl border border-line bg-ink2 shadow-2xl pop">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="glow flex h-8 w-8 items-center justify-center rounded-xl text-ink0"><Bot /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Repository Buddy</p>
          <p className="truncate text-[11px] text-muted">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            Gemini Flash · reads only your current digest
          </p>
        </div>
        <button onClick={() => setOpen(false)} aria-label="Close assistant"
          className="ml-auto rounded-lg px-2 py-1 text-muted hover:bg-ink3 hover:text-fg">✕</button>
      </header>

      <div className="scroll-y flex-1 space-y-3 p-3">
        {!msgs.length && (
          <div className="fade">
            <p className="text-sm">
              <span className="font-medium">Hi Keerthi — I&apos;m Repository Buddy.</span>{' '}
              <span className="text-muted">
                Ask me anything about this week&apos;s releases across the repos you track. I only read
                the digest already on this dashboard, so I can&apos;t invent a version or a CVE.
              </span>
            </p>
            <div className="mt-3 flex flex-col items-start gap-2">
              {SUGGESTED.map((s) => (
                <FlowButton key={s} size="sm" text={s} onClick={() => ask(s)} />
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
            <p className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-line bg-ink0 px-3 py-2 text-sm text-muted">
              <span className="typing"><span>●</span><span>●</span><span>●</span></span>
              <span className="fade text-xs">{stage}</span>
            </p>
          </div>
        )}
        {err && <p className="rounded-xl border border-high/40 bg-high/10 px-3 py-2 text-xs text-high">{err}</p>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex items-center gap-2 border-t border-line p-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} disabled={busy}
          placeholder="Ask Repository Buddy…" aria-label="Your question"
          className="min-w-0 flex-1 rounded-xl border border-[#4A4039] bg-ink0 px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-70" />
        <button type="submit" disabled={busy || !q.trim()} aria-label="Send"
          className="group relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden
            rounded-full border-[1.5px] border-accent/40 bg-accent/[0.08] text-accent
            transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)]
            hover:rounded-[12px] hover:border-transparent hover:text-ink0
            active:scale-[0.95] disabled:opacity-40 disabled:hover:rounded-full disabled:hover:text-accent">
          <span aria-hidden className="glow absolute inset-0 origin-center scale-[0.1] rounded-full opacity-0
            transition-all duration-[700ms] ease-[cubic-bezier(0.19,1,0.22,1)]
            group-hover:scale-100 group-hover:rounded-[12px] group-hover:opacity-100
            group-disabled:opacity-0 group-disabled:scale-[0.1]" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" className="relative z-[1] h-4 w-4">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </form>
    </div>
  );
}

/** Little robot head, so the control reads as "chatbot" at a glance. */
function Bot() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="4" y="8" width="16" height="11" rx="3.5" />
      <path d="M12 4.5v3.5M8.5 19v1.5M15.5 19v1.5M2.5 12.5v2M21.5 12.5v2" />
      <circle cx="9.3" cy="13" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="14.7" cy="13" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
