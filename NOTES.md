# Release Radar — working notes

## Shipped
- Live: https://release-radar-radhi2.vercel.app · repo: github.com/radhikanarayan-mesa23/release-radar
- Crons registered: `30 2 * * 1` + `0 3 * * *` = Mon 08:00 IST / daily 08:30 IST
- Stored 30-day run: 66 releases, 27 HIGH, 38 open tickets, 24 repos, ₹2.47
- Rules 12/13 · rules+Gemini 13/13 · 0 security missed · 0 false HIGHs (eval stored)
- Email verified: digest delivered; teammate fallback to DIGEST_TO proven
- UI rebuilt dark; status palette validated against the dark surface (all AA text contrast)

## Left for Keerthi
- Verify a domain at resend.com/domains + set EMAIL_FROM, so teammates get assignment
  mail directly instead of it being forwarded to DIGEST_TO
- Replace the seeded `@example.com` team emails in the Team panel on /repos
- Admin passcode: set in Vercel env (ADMIN_PASSCODE), used once at /login

## Bugs found by live data (all fixed)
- `prev_tag` was "previous release by date": a v4 backport diffed against v5 gave a
  fake MAJOR -> fake BREAKING -> fake HIGH, and monorepos diffed unrelated packages.
  `previousTag()` now picks the highest version below the current one, same tag prefix.
- Gemini `maxOutputTokens` 8192 truncated the 30-day call; only the retry saved it,
  silently doubling cost. Now 32768.
- Resend matches the account address case-sensitively: `Radhika_` 403'd, `radhika_` works.
- Neon returns timestamptz as a Date, not a string — `.slice()` crashed the dashboard.
- A falsy-zero JSX guard printed a literal `0` under every card with no history.
- Scripts needed `.mts`: top-level await fails under tsx's cjs transform.
- `/quality` scored F10 a miss when Gemini had correctly saved it (rule 2 allows
  ADDING a flag; grading now checks priority + no lost expected flag).

## Assumptions (`// ASSUME:` in code)
- An unflagged MINOR/MAJOR is MEDIUM from rules alone (fixtures F03/F11 need this);
  Gemini can drop it to LOW with `action = "no action"`.
- NOT_SURE only when nothing is flagged at all — a flagged-but-unsure item keeps its
  flag priority (the safe direction).
- `bumpOf` returns UNKNOWN with no same-package predecessor in the fetched 15.
- Fixtures carry no category, so test-rules and /quality treat them as `dependency`.
- `cacheComponents` off in next.config.ts: every page reads live Neon state.
