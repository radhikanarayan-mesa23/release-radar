'use client';
import { useCallback, useState, useSyncExternalStore } from 'react';

const KEY = 'rr_seen';
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/**
 * Monday-morning nudge. The weekly cron runs at 08:00 IST and emails the digest;
 * this is the in-app half of that — it tells Keerthi the run already happened
 * before she opened the tab, and how much is waiting.
 */
export default function Bell({
  need, kind, generatedAt, nextRun,
}: { need: number; kind: string | null; generatedAt: string | null; nextRun: string }) {
  const [open, setOpen] = useState(false);
  // Server renders null, so the dot appears only after hydration — no mismatch.
  const seen = useSyncExternalStore(subscribe, read, () => null);
  const markSeen = useCallback((stamp: string) => {
    try { localStorage.setItem(KEY, stamp); } catch { /* private window */ }
    listeners.forEach((fn) => fn());
  }, []);

  const unseen = !!generatedAt && seen !== generatedAt;
  const isMonday = kind === 'weekly';
  const when = generatedAt
    ? new Date(generatedAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : null;

  function toggle() {
    setOpen(!open);
    if (!open && generatedAt) markSeen(generatedAt);
  }

  return (
    <div className="relative no-print">
      <button onClick={toggle} aria-label={`Notifications${unseen ? ', new' : ''}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-ink2 text-muted hover:text-fg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-[18px] w-[18px]">
          <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.3 21a2 2 0 0 0 3.4 0" strokeLinecap="round" />
        </svg>
        {unseen && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-ink1" />}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-line bg-ink2 p-4 shadow-2xl">
          {when ? (
            <>
              <p className="text-sm font-semibold">
                {isMonday ? 'Monday digest is ready' : 'Latest check complete'}
              </p>
              <p className="mt-1 text-xs text-muted">Ran automatically at {when} — before you opened this.</p>
              <p className="mt-3 text-sm">
                {need > 0
                  ? <><span className="font-semibold text-accent">{need}</span> release{need > 1 ? 's' : ''} need your attention.</>
                  : 'Nothing urgent. Everything tracked shipped routine updates.'}
              </p>
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                A copy was emailed to you. Next automatic run: <span className="text-fg">{nextRun}</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">No run yet</p>
              <p className="mt-1 text-xs text-muted">First automatic run: {nextRun}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
