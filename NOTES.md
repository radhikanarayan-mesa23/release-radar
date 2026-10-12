# Release Radar — working notes

## Done
- P1 scaffold (Next 16 / React 19 / Tailwind 4), `lib/db.ts` (Neon HTTP, lazy), `lib/github.ts`, `lib/rules.ts`
- P1 gate: `npm run test:rules` → **12/13 rules-only**, F10 is the AI-only miss, F13 → LOW (not HIGH)
- P2 `lib/gemini.ts` (one batched JSON call, zod + 1 retry), `lib/pipeline.ts` (runDigest), `scripts/dry-run.ts`
- P3 `/` briefing + priority strip + 5 tabs + assign/status/note cards, `/login` (sha256 cookie)
- P4 `/repos` bulk add + category/pause/delete + Team panel, `/status`, `/quality`
- P5 `lib/email.ts` (digest / alert / assignment with DIGEST_TO fallback), `/api/report` html+csv, `vercel.json` crons
- `next build` green, 16 routes

## Verified without keys (2026-10-12)
- eslint: 0 errors; `next build` green; all 6 pages return 200; `POST /api/run` without passcode → 401
- `npm run smoke` — live unauthenticated GitHub check over 5 real repos + monorepo tags. Found and fixed:
  - **prev_tag bug**: "previous release by date" made a v4 backport compare against v5 (fake MAJOR →
    fake BREAKING → fake HIGH), and compared unrelated packages in a monorepo. Now `previousTag()`
    picks the highest version BELOW the current one within the same package prefix.
  - scripts needed `.mts` (top-level await fails under tsx's cjs transform) — `dry-run` would have
    failed on first use.
- SECURITY regex checked against real notes: hits on fastify/axios are true positives (GHSA link,
  "🔒 Security Fixes" section). Left exactly as the brief specifies.
- Email templates rendered to `email-preview/` (gitignored) — digest, assignment, alert all good.
- Static cross-check: every table and column used in SQL exists in `db/schema.sql`.

## Shipped
- Live: https://release-radar-radhi2.vercel.app (public read, admin passcode for writes)
- Repo: github.com/radhikanarayan-mesa23/release-radar
- Crons registered: `30 2 * * 1` weekly + `0 3 * * *` daily = Mon 08:00 / daily 08:30 IST
- 30-day run stored: 66 releases, 27 HIGH, 38 open tickets, 24 repos, ₹2.47
- UI rebuilt dark (status palette validated vs the dark surface; all AA text contrast)

## Next
- Run `db/schema.sql` then `db/seed.sql` in the Neon SQL editor
- Fill `.env`, then `npm run dry-run -- 30` (first live run, creates tickets)
- Deploy to Vercel, set the same env, set `APP_URL`, re-run 30 days, run the Gemini eval on /quality
- README live URL + components map

## Assumptions (`// ASSUME:` in code)
- `lib/rules.ts`: an unflagged MINOR/MAJOR is MEDIUM from rules alone (fixtures F03/F11 expect it);
  Gemini can drop it to LOW with `action = "no action"`.
- `lib/pipeline.ts`: NOT_SURE only when nothing is flagged at all — a flagged-but-unsure item keeps its
  flag priority (the safe direction).
- `bumpOf` returns UNKNOWN when there is no previous release of the same package in the fetched
  15 — shown as "No earlier release of this package to compare against", priority LOW.
- Fixtures carry no category, so `scripts/test-rules.ts` and `/quality` treat them all as `dependency`.
- `cacheComponents` turned off in `next.config.ts`: every page reads live Neon state.
