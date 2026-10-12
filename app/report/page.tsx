import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Report() {
  const admin = await isAdmin();
  const windows = [
    { days: 1, label: 'Last 24 hours' },
    { days: 7, label: 'Last 7 days' },
    { days: 30, label: 'Last 30 days' },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Download a report</h1>
        <p className="text-sm text-muted">
          Built from what is already stored — no AI call, so a report costs nothing.
          HTML opens print-ready (⌘P → Save as PDF); CSV opens in Excel.
        </p>
      </header>
      {!admin && <p className="card p-4 text-sm">Reports are admin-only. <a href="/login" className="underline">Log in</a>.</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {windows.map((w) => (
          <div key={w.days} className="card p-4">
            <div className="font-medium">{w.label}</div>
            <div className="mt-3 flex gap-2 text-sm">
              <a href={`/api/report?days=${w.days}&format=html`} target="_blank" rel="noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-ink3">HTML</a>
              <a href={`/api/report?days=${w.days}&format=csv`}
                className="rounded-lg border border-line px-3 py-1.5 hover:bg-ink3">CSV</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
