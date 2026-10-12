'use client';
import Link from 'next/link';
import { useEffect } from 'react';

/** Any uncaught render error: say what still works instead of a blank page. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[render]', error); }, [error]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="card p-6">
        <h1 className="text-lg font-semibold">Something broke on this page</h1>
        <p className="mt-2 text-sm text-muted">
          Your data is safe — every digest, ticket and report is stored in Postgres, not in this page.
          The Monday run is scheduled independently and is unaffected.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={reset} className="glow rounded-xl px-3 py-2 text-sm font-semibold text-ink0">
            Try again
          </button>
          <Link href="/dashboard" className="rounded-xl border border-[#4A4039] px-3 py-2 text-sm hover:border-accent">
            Back to the dashboard
          </Link>
          <Link href="/status" className="rounded-xl border border-[#4A4039] px-3 py-2 text-sm hover:border-accent">
            Check system status
          </Link>
        </div>
        {error.digest && (
          <p className="mt-4 border-t border-line pt-3 font-mono text-xs text-muted">ref {error.digest}</p>
        )}
      </div>
    </div>
  );
}
