'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useState, useSyncExternalStore } from 'react';

const KEY = 'rr_nav_open';
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

const I = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
    <path d={d} />
  </svg>
);

const NAV = [
  { href: '/', label: 'Dashboard', hint: 'Briefing and triage', icon: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5' },
  { href: '/repos', label: 'Repositories', hint: 'What is being checked', icon: 'M4 4h10l6 6v10H4zM14 4v6h6' },
  { href: '/report', label: 'Reports', hint: 'Download HTML or CSV', icon: 'M12 3v12m0 0-4-4m4 4 4-4M4 19h16' },
  { href: '/quality', label: 'Quality', hint: 'How accurate the flags are', icon: 'M20 6 9 17l-5-5' },
  { href: '/status', label: 'Status', hint: 'Runs, cost and errors', icon: 'M3 12h4l3 8 4-16 3 8h4' },
  { href: '/about', label: 'Welcome', hint: 'What this is and why', icon: 'M12 16v-5M12 8h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0' },
];

export default function Rail() {
  const path = usePathname();
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default EXPANDED: a first-time visitor should never have to discover a
  // control to read the navigation. '0' means they chose to collapse it.
  const open = stored !== '0';

  const toggle = useCallback(() => {
    try { localStorage.setItem(KEY, open ? '0' : '1'); } catch { /* private window */ }
    listeners.forEach((fn) => fn());
  }, [open]);

  const Item = ({ n }: { n: (typeof NAV)[number] }) => {
    const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
    return (
      <Link href={n.href} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)}
        title={open ? undefined : n.label}
        className={`flex items-center gap-3 rounded-xl px-[11px] py-2.5 transition
          ${open ? '' : 'justify-center'}
          ${active ? 'glow text-ink0' : 'text-fg/70 hover:bg-ink3 hover:text-fg'}`}>
        {I(n.icon)}
        {open && (
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-medium">{n.label}</span>
            <span className={`block truncate text-[11px] ${active ? 'opacity-75' : 'text-muted'}`}>{n.hint}</span>
          </span>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* mobile: a bar with a menu button, and a sheet underneath */}
      <div className="no-print flex items-center gap-2 border-b border-line bg-ink1 px-3 py-2 lg:hidden">
        <button onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen}
          className="flex items-center gap-2 rounded-xl border border-line bg-ink2 px-3 py-2 text-sm">
          {I('M4 7h16M4 12h16M4 17h16')} Menu
        </button>
      </div>
      {mobileOpen && (
        <nav aria-label="Primary" className="no-print rise space-y-1 border-b border-line bg-ink1 p-2 lg:hidden">
          {NAV.map((n) => <div key={n.href} className="[&_span]:!block"><Item n={{ ...n }} /></div>)}
        </nav>
      )}

      {/* desktop: collapsible panel, never a hover tooltip */}
      <nav aria-label="Primary"
        className={`no-print hidden shrink-0 flex-col gap-1 border-r border-line bg-ink1 p-2 transition-[width] duration-200
          lg:sticky lg:top-0 lg:flex lg:h-dvh ${open ? 'lg:w-[236px]' : 'lg:w-[76px]'}`}>
        <div className={`flex items-center gap-2 px-1 pb-2 pt-1 ${open ? '' : 'flex-col'}`}>
          <Link href="/" aria-label="Release Radar home"
            className="glow flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-[18px] w-[18px]">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
            </svg>
          </Link>
          {open && <span className="min-w-0 flex-1 truncate text-sm font-semibold">Release Radar</span>}

          {/* Always visible, right at the top — the control is the discovery. */}
          <button onClick={toggle} aria-expanded={open}
            aria-label={open ? 'Collapse the menu' : 'Expand the menu'}
            title={open ? 'Collapse the menu' : 'Expand the menu'}
            className="flex h-9 shrink-0 items-center justify-center gap-1 rounded-xl border border-[#4A4039] bg-ink2 px-2 text-muted transition hover:border-accent hover:bg-ink3 hover:text-accent">
            <span className={`transition-transform duration-200 ${open ? '' : 'rotate-180'}`}>
              {I('m15 6-6 6 6 6')}
            </span>
            {!open && <span className="text-[10px] font-semibold uppercase tracking-wide">Menu</span>}
          </button>
        </div>

        <div className="h-px w-full bg-line" />
        <div className="mt-1 space-y-1">{NAV.map((n) => <Item key={n.href} n={n} />)}</div>


      </nav>
    </>
  );
}
