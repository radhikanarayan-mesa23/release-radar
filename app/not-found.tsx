import Link from 'next/link';

export default function NotFound() {
  const links = [
    ['/', 'Welcome', 'What this is and why'],
    ['/dashboard', 'Dashboard', 'Briefing and triage'],
    ['/repos', 'Repositories', 'What is being checked'],
    ['/report', 'Reports', 'Download HTML or CSV'],
    ['/quality', 'Quality', 'How accurate the flags are'],
    ['/status', 'Status', 'Runs, cost and errors'],
  ];
  return (
    <div className="mx-auto max-w-lg">
      <div className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent">404</p>
        <h1 className="mt-1 text-lg font-semibold">That page isn&apos;t here</h1>
        <p className="mt-2 text-sm text-muted">Release Radar has these pages:</p>
        <ul className="mt-3 divide-y divide-line">
          {links.map(([href, label, hint]) => (
            <li key={href}>
              <Link href={href} className="flex items-baseline gap-2 py-2 text-sm hover:text-accent">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted">{hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
