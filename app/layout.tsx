import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import Link from 'next/link';
import './globals.css';
import { isAdmin } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Release Radar',
  description: 'Weekly AI release digest for the repos your product depends on.',
};

const NAV = [
  { href: '/', label: 'Digest' },
  { href: '/repos', label: 'Repos' },
  { href: '/report', label: 'Report' },
  { href: '/quality', label: 'Quality' },
  { href: '/status', label: 'Status' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const admin = await isAdmin();
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-screen">
        <header className="no-print border-b border-line bg-white/70 backdrop-blur sticky top-0 z-20">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              Release&nbsp;Radar
            </Link>
            <nav className="flex gap-4 text-sm text-muted">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-ink">{n.label}</Link>
              ))}
            </nav>
            <div className="ml-auto text-xs">
              {admin ? (
                <span className="rounded-full border border-line px-2 py-1">
                  Admin · <Link href="/login" className="underline">log out</Link>
                </span>
              ) : (
                <Link href="/login" className="rounded-full border border-line px-3 py-1 hover:bg-paper">
                  Admin log in
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="no-print mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-muted">
          Public GitHub REST API · Gemini Flash · Neon · Vercel. Anyone can read; admin actions need the passcode.
        </footer>
      </body>
    </html>
  );
}
