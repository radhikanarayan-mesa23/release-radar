# Release Radar — working notes

## Done
- P1 scaffold (Next 16 / React 19 / Tailwind 4), `lib/db.ts` (Neon HTTP, lazy), `lib/github.ts`, `lib/rules.ts`
- P1 gate: `npm run test:rules` → **12/13 rules-only**, F10 is the AI-only miss, F13 → LOW (not HIGH)
- P2 `lib/gemini.ts` (one batched JSON call, zod + 1 retry), `lib/pipeline.ts` (runDigest), `scripts/dry-run.ts`
- P3 `/` briefing + priority strip + 5 tabs + assign/status/note cards, `/login` (sha256 cookie)
- P4 `/repos` bulk add + category/pause/delete + Team panel, `/status`, `/quality`
- P5 `lib/email.ts` (digest / alert / assignment with DIGEST_TO fallback), `/api/report` html+csv, `vercel.json` crons
- `next build` green, 16 routes

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
- `bumpOf` returns UNKNOWN when there is no previous release to compare against.
- Fixtures carry no category, so `scripts/test-rules.ts` and `/quality` treat them all as `dependency`.
- `cacheComponents` turned off in `next.config.ts`: every page reads live Neon state.
