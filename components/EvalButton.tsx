'use client';
import { useState, useTransition } from 'react';

export default function EvalButton() {
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="no-print mt-3 flex items-center gap-3">
      <button
        disabled={pending}
        onClick={() => start(async () => {
          setMsg('Calling Gemini once…');
          const res = await fetch('/api/eval', { method: 'POST' });
          const j = await res.json().catch(() => ({}));
          setMsg(res.ok ? `Stored ${j.items} results (${j.input_tokens}/${j.output_tokens} tokens). Reloading…` : (j.error ?? 'Failed'));
          if (res.ok) setTimeout(() => location.reload(), 1200);
        })}
        className="rounded-lg bg-ink px-3 py-2 text-sm text-white disabled:opacity-40"
      >
        {pending ? 'Running…' : 'Re-run Gemini evaluation'}
      </button>
      {msg && <span className="text-xs text-muted">{msg}</span>}
    </div>
  );
}
