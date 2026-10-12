import Link from 'next/link';
import type { Metadata } from 'next';
import BackgroundPaths from '@/components/BackgroundPaths';
import { sql } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Welcome',
  description: 'Security fixes and breaking changes first, every Monday 08:00 IST.',
};
export const dynamic = 'force-dynamic';

async function stats() {
  try {
    const r = (await sql`
      select
        (select count(*) filter (where active)::int from repos)              as repos,
        (select count(*)::int from releases)                                  as releases,
        (select count(*)::int from releases where 'SECURITY' = any(flags))    as security,
        (select count(*)::int from runs)                                      as runs`) as
      { repos: number; releases: number; security: number; runs: number }[];
    return r[0];
  } catch { return null; }
}

const STEPS = [
  { n: '01', t: 'Watch', d: 'Reads releases only — never issues, PRs or commits — from every public repo you track, through the official GitHub API.' },
  { n: '02', t: 'Decide in code', d: 'Rules run first: CVE and advisory patterns, semver major bumps, breaking-change language. A security fix that only touches /examples is deliberately not a risk.' },
  { n: '03', t: 'Then ask Gemini', d: 'One batched Gemini Flash call summarises and may ADD a flag the rules missed — never remove one. If it fails, the digest still ships on rule flags alone.' },
  { n: '04', t: 'Rank and route', d: 'Security and breaking changes sort to the top. Each flagged release becomes a ticket you can assign, note and close.' },
  { n: '05', t: 'Reach you', d: 'Monday 08:00 IST in your inbox, a daily 08:30 security sweep, and a Telegram push the moment a new HIGH security release lands.' },
];

export default async function About() {
  const s = await stats();
  return (
    <div className="mx-auto max-w-4xl">
      <BackgroundPaths
        title="Welcome to your repo check"
        subtitle="Two dozen repositories, read every Monday at 08:00 IST. Security fixes and breaking changes first, everything routine folded away."
        cta="Open the dashboard"
        href="/"
      />

      <section className="rise">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Why it exists</p>
        <h1 className="mt-3 text-3xl font-semibold leading-[1.12] tracking-tight sm:text-5xl">
          A security patch once sat unread
          <span className="block bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
            for eleven days.
          </span>
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted sm:text-lg">
          Keerthi ships payments and auth at a fintech startup. She watches two dozen public repos,
          and GitHub Watch tells her about everything equally — every comment, every label, every
          routine bump. So the one release that actually mattered drowned.
        </p>
        <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">
          Release Radar reads <span className="text-fg">only releases</span>, puts security fixes and
          breaking changes at the top, and is designed to be finished in five minutes.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className="glow lift rounded-xl px-5 py-3 text-sm font-semibold text-ink0">
            Open the dashboard →
          </Link>
          <Link href="/quality" className="lift rounded-xl border border-[#4A4039] px-5 py-3 text-sm hover:border-accent">
            See how accurate it is
          </Link>
        </div>
      </section>

      {s && (
        <section className="stagger mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [s.repos, 'repositories watched'],
            [s.releases, 'releases triaged'],
            [s.security, 'security-flagged'],
            [s.runs, 'checks run'],
          ].map(([v, l]) => (
            <div key={String(l)} className="card p-4">
              <div className="text-2xl font-semibold text-accent">{v as number}</div>
              <div className="mt-0.5 text-xs text-muted">{l as string}</div>
            </div>
          ))}
        </section>
      )}

      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">How it works</h2>
        <ol className="mt-4 space-y-3">
          {STEPS.map((st) => (
            <li key={st.n} className="card lift flex gap-4 p-4">
              <span className="font-mono text-sm text-accent">{st.n}</span>
              <div>
                <h3 className="text-sm font-semibold">{st.t}</h3>
                <p className="mt-1 text-sm text-muted">{st.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Why trust the colours</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            ['Code decides first', 'Rules are pure and tested against 13 fixtures. The model can add a flag, never argue one away.'],
            ['Example code is not a risk', 'A CVE fixed inside /examples stays routine — otherwise a quarter of dependency releases would scream red.'],
            ['It still works if the AI is down', 'Gemini failing drops the summaries, not the digest. Rules alone score 12 of 13.'],
          ].map(([t, d]) => (
            <div key={t} className="card p-4">
              <h3 className="text-sm font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card mt-12 flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">See this week</h2>
          <p className="mt-1 text-sm text-muted">Real data, updated by a scheduled run every Monday at 08:00 IST.</p>
        </div>
        <Link href="/" className="glow lift shrink-0 rounded-xl px-5 py-3 text-sm font-semibold text-ink0">
          Open the dashboard →
        </Link>
      </section>
    </div>
  );
}
