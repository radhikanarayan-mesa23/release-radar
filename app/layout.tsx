import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import Link from 'next/link';
import './globals.css';
import Rail from '@/components/Rail';
import Bell from '@/components/Bell';
import { isAdmin } from '@/lib/auth';
import { nextMondayRun } from '@/lib/schedule';
import { sql } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Release Radar',
  description: 'Security fixes and breaking changes first, every Monday 08:00 IST.',
};

async function headline() {
  try {
    // Same preference as latestDigest(): the daily security sweep must not
    // become "the digest" in the bell.
    const rows = (await sql`
      select kind, counts, created_at from digests
      order by (kind <> 'daily-security') desc, created_at desc limit 1`) as {
        kind: string; counts: Record<string, number>; created_at: string }[];
    if (!rows.length) return { need: 0, kind: null, generatedAt: null };
    const c = rows[0].counts ?? {};
    return {
      need: (c.HIGH ?? 0) + (c.MEDIUM ?? 0) + (c.NOT_SURE ?? 0),
      kind: rows[0].kind,
      generatedAt: new Date(rows[0].created_at).toISOString(),
    };
  } catch {
    return { need: 0, kind: null, generatedAt: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [admin, head] = await Promise.all([isAdmin(), headline()]);
  const nextRun = nextMondayRun();

  return (
    <html lang="en" className={GeistSans.className}>
      <body className="min-h-dvh lg:flex">
        <Rail />
        <div className="min-w-0 flex-1">
          <header className="no-print sticky top-0 z-30 border-b border-line bg-ink1/80 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <Link href="/" className="flex items-baseline gap-2">
                <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-base font-semibold text-transparent">
                  Release&nbsp;Radar
                </span>
                <span className="hidden text-sm text-muted sm:inline">· for Keerthi</span>
              </Link>

              <div className="ml-auto flex items-center gap-2">
                <span className="hidden rounded-xl border border-line bg-ink2 px-3 py-[7px] text-xs text-muted md:inline">
                  Next auto-run <span className="text-fg">{nextRun}</span>
                </span>
                <Bell need={head.need} kind={head.kind} generatedAt={head.generatedAt} nextRun={nextRun} />
                {admin ? (
                  <Link href="/login"
                    className="flex items-center gap-2 rounded-xl border border-line bg-ink2 px-3 py-[7px] text-xs hover:bg-ink3">
                    <span className="h-2 w-2 rounded-full bg-accent" /> Admin
                  </Link>
                ) : (
                  <Link href="/login"
                    className="rounded-xl border border-line bg-ink2 px-3 py-[7px] text-xs text-muted hover:text-fg">
                    Unlock admin
                  </Link>
                )}
              </div>
            </div>
          </header>

          <main className="px-4 py-5 pb-28 sm:px-6">{children}</main>

          <footer className="no-print px-4 pb-10 pt-6 text-xs text-muted sm:px-6">
            Public GitHub REST API · Gemini Flash · Neon · Vercel. Anyone can read; admin actions need the passcode.
          </footer>
        </div>
      </body>
    </html>
  );
}
