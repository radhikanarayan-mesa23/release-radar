'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d={d} />
  </svg>
);

const NAV = [
  { href: '/', label: 'Dashboard', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { href: '/repos', label: 'Repositories', icon: 'M4 4h10l6 6v10H4zM14 4v6h6' },
  { href: '/report', label: 'Reports & export', icon: 'M12 3v12m0 0-4-4m4 4 4-4M4 19h16' },
  { href: '/quality', label: 'Classifier quality', icon: 'M20 6 9 17l-5-5' },
  { href: '/status', label: 'System status', icon: 'M3 12h4l3 8 4-16 3 8h4' },
];

export default function Rail() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="no-print flex shrink-0 flex-row gap-1 border-line bg-ink1 p-2
      lg:h-dvh lg:w-[60px] lg:flex-col lg:items-center lg:gap-2 lg:border-r lg:py-4 lg:sticky lg:top-0">
      <Link href="/" aria-label="Release Radar home"
        className="glow hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink0 lg:flex">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[18px] w-[18px]">
          <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
        </svg>
      </Link>
      <div className="hidden h-px w-7 bg-line lg:block" />
      {NAV.map((n) => {
        const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} title={n.label} aria-label={n.label}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex h-9 w-9 items-center justify-center rounded-xl transition
              ${active ? 'glow text-ink0' : 'text-muted hover:bg-ink3 hover:text-fg'}`}>
            {I(n.icon)}
            <span className="pointer-events-none absolute left-11 z-50 hidden whitespace-nowrap rounded-lg
              border border-line bg-ink3 px-2 py-1 text-xs text-fg shadow-lg lg:group-hover:block">
              {n.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
