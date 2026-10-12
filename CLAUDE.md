# Release Radar: Claude Code Build Brief (v2 · Neon)

> Start Claude Code in a folder containing this file plus `db/`, `seed/`, `.env.example` and `components_map.png`.
> Work **phase by phase**. **Stop after each phase**, report in ≤ 8 lines (what changed, how to test, open `// ASSUME:`), and wait for "next".
> Credits are limited. Follow section 12 strictly.

---

## 1. The brief (decoded)

**Keerthi** is a senior engineer at a fintech startup. Her product depends on payment gateways, auth libraries and banking APIs, and she evaluates a few open-source tools before adopting them. She watches 20+ public GitHub repos. GitHub Watch is a firehose, and last quarter a **security patch sat unread for 11 days**.

**Build:** an AI-powered release digest, **delivered every Monday at 08:00 IST**. It covers releases only (no issues, PRs, comments or commits) from the past 7 days, puts **security fixes and breaking changes at the top**, is scannable in **5 minutes**, and has a repo list that is **editable without touching code**.

**Exam rules:**
- **Gemini Flash only** for all AI (no Claude API in the app)
- **live external data**
- **deployed on Vercel** with a **public URL**
- submit the GitHub repo + the Components Map
- the site must show real data at submission

**Keerthi's extra requirements (from the product owner):**
1. She can **add more repos** herself, including several links at once, and mark each as *dependency* or *evaluating*.
2. When she opens the app, a **briefing summary** comes first: what needs attention, grouped by priority, then **cards** for each flagged release and repo.
3. Every flagged release can be **assigned to a teammate**, with a status and a note. The assignee gets an email.
4. Work marked **Fixed moves to a separate "Fixed" tab** and stays fixed in later digests.
5. **An email goes to her after every run**, plus the Monday digest.
6. She can **download a report** for the last 24 hours, 7 days or 30 days.
7. **Evaluating** repos show release cadence and community momentum.

---

## 2. Public by design (must work on public domains)

- **Data:** public GitHub repositories only, through the official REST API (`api.github.com`). **No scraping, no OAuth, no GitHub App.** Any public repo can be added by `owner/name` or URL with no setup on the repo side.
- **App:** deployed at a public `*.vercel.app` URL. **Anyone can view** the digest, tabs, evaluating stats, past digests, `/quality` and `/status`. **Only admin actions need the passcode:** add, remove or edit repos, run now, assign, change status, notes, team edits, and downloading reports.
- **Email:**
  - With Resend's default sender `onboarding@resend.dev`, mail only reaches the Resend account owner's address.
  - To email teammates (assignments), verify a domain in Resend and set `EMAIL_FROM` to it.
  - Until then: if an assignee email fails, send the assignment notice to `DIGEST_TO` instead with "(intended for <name>)", log it, and show it in the ticket history. **Never fail the action because email failed.**
- **No secrets in the client.** All GitHub, Gemini, Neon and Resend calls are server-side only.

---

## 3. Hard rules

1. **Releases only.** Never include issues, PRs, comments or commits.
2. **Security is decided by code first, AI second.** Final flags = rule flags **OR** Gemini flags. Gemini can add a flag but **never remove one**.
3. **Example-only changes are not security.** The rules ignore lines about `examples/`, `docs/`, tests, playgrounds, `devDependencies` or `chore(deps-dev)` / `chore(examples)`. Test case F13 checks this.
4. **Always deliver.** If Gemini fails, still save and email the digest using the rule flags plus the first lines of each release note, with the banner "AI summary unavailable: flags from rules only".
5. **One Gemini call per run**, with all releases batched. Release bodies are truncated to 3,000 characters, with at most 40 releases (flagged first). The model name comes from `GEMINI_MODEL`.
6. **Secrets only in env.** Commit `.env.example`, never `.env`.
7. **Never lose triage.** Tickets are keyed by `release_id` (repo + tag), so a status survives every later run.

---

## 4. Stack (do not add other libraries without asking)

- Next.js 14+ App Router, TypeScript, Tailwind
- **Neon Postgres** via `@neondatabase/serverless`: the `neon(process.env.DATABASE_URL)` HTTP driver with tagged-template SQL. No ORM.
- `zod`, `semver`
- Gemini via REST `fetch` (JSON mode). Resend via REST `fetch`.
- Vercel Cron

**Neon setup:** Vercel → Project → Storage → Create → Neon (this auto-adds `DATABASE_URL`), or create the project at neon.tech and paste the pooled URL. Run `db/schema.sql`, then `db/seed.sql`, in the Neon SQL Editor. **Do not regenerate the schema.** If you need a column, add a numbered file such as `db/002_*.sql` and tell me to run it.

---

## 5. Priorities (what the colours mean)

| Priority | Rule (applied in code after merging flags) |
|---|---|
| **HIGH** | SECURITY flag, **or** BREAKING on a *dependency* repo |
| **MEDIUM** | BREAKING on an *evaluating* repo, **or** a MINOR/MAJOR release with new features (Gemini `action = "plan upgrade"`) |
| **LOW** | Patch, docs, routine dependency bumps, example-only changes, unknown version with no flags |
| **NOT_SURE** | Gemini `confidence < 0.6` **and** no rule flag. Shown with a "not sure" chip and treated like MEDIUM for tickets. |

- Tickets are auto-created for **HIGH, MEDIUM and NOT_SURE** with status `open`.
- Every card has a **"Why this colour?"** line: Gemini's `why`, or the rule that fired, for example "Matched CVE-2026-1234 in release notes".

---

## 6. Pipeline: `lib/pipeline.ts` → `runDigest({ days, kind, email })`

1. **Load** active repos from Neon.
2. **Fetch** per repo (concurrency 5, `Authorization: Bearer GITHUB_TOKEN`):
   - `GET /repos/{o}/{r}/releases?per_page=15`: keep non-draft releases published within `days`. Pre-releases are hidden unless flagged; count the hidden ones.
   - If the repo has **no releases at all**: `GET /repos/{o}/{r}/tags?per_page=3`, plus each tag's commit date.
   - `GET /repos/{o}/{r}/security-advisories?state=published&per_page=5`: an advisory published in the window adds SECURITY to that repo's newest release, or becomes its own item. Skip silently on 403/404.
   - *Evaluating* repos also get `GET /repos/{o}/{r}` for stars, saved to `star_snapshots`.
   - A 404 means the repo was renamed or deleted: record the error and show it on `/status` and on the repo row.
3. **Rules** (`lib/rules.ts`, pure and tested):
   - `SECURITY` regex: `CVE-\d{4}-\d+|GHSA-|security|vulnerab|XSS|CSRF|SSRF|RCE|injection|auth(entication)? bypass|privilege escalation|denial of service|DoS|sanitiz|leak`, applied **line by line, ignoring example/docs/test/devDependency lines** (rule 3).
   - `BREAKING` = semver **major** vs the previous release, or `/BREAKING|breaking change|removed support|no longer supported|migration (guide|required)|drop(ped)? support/i`.
   - Bump: strip everything before the last `@` and any leading non-digits, then `semver.diff`. Monorepo tags like `@hono/bun@1.0.1` must work.
4. **Gemini** (`lib/gemini.ts`), one call. Input: `[{id, repo, category, tag, title, body, rule_flags}]`. Output (validated with zod, one retry):
   ```json
   {"items":[{"id":"","summary":["≤18 words","≤18 words"],"is_security":false,"is_breaking":false,
     "action":"upgrade now|plan upgrade|no action","why":"≤15 words","confidence":0.0}],
    "briefing":[{"priority":"HIGH|MEDIUM|LOW","text":"≤20 words, names repos and what to do"}]}
   ```
   The prompt must say: dependency bumps in example code, docs, tests or devDependencies are not a security risk for consumers.
5. **Priority** (section 5) → **upsert `releases`** → **auto-create tickets** (only if none exists for that release).
6. **Digest payload:**
   - briefing (from Gemini; fallback built in code from the HIGH/MEDIUM `why` lines)
   - counts
   - items grouped by priority, with releases grouped under each repo (show 3 per repo, then "Show n more")
   - evaluating stats
   - quiet repos
   - hidden pre-release count
   - repo errors
   - AI tokens and cost

   Save it to `digests` together with the `runs` row.
7. **Email:** send it to `DIGEST_TO` when `kind = weekly`, or `manual` with `email = true` (the default). Daily security runs send **only if** there is a new HIGH security item (an alert email).

---

## 7. Pages (one app shell: top nav + main + right sidebar on desktop, stacked on mobile)

### `/`: Home (what Keerthi sees first)

1. **Briefing card:** "This week: N need attention." Then 3–5 bullets grouped HIGH → MEDIUM → LOW, the window ("5 Oct – 12 Oct · 7 days"), and the generated time.
2. **Priority strip:** HIGH / MEDIUM / LOW / NOT SURE / Quiet counts. Each one filters the list when clicked.
3. **Tabs:**
   - **Needs action (n):** open + in-progress tickets, grouped by priority. Each **card** shows:
     - repo avatar, repo, category pill
     - version, date
     - flag chips (SECURITY / BREAKING / MAJOR / PRE-RELEASE)
     - priority chip
     - **Why this colour?**
     - 2 summary bullets
     - **assignee dropdown, status select (Open / In progress / Fixed / Dismissed), note**
     - "View release notes →"
     - a ticket history line, for example "Assigned to Meera by Keerthi · 2h ago"
   - **Fixed (n):** fixed and dismissed tickets, showing who fixed them and when, with a reopen button.
   - **All releases:** the full digest. Routine items are one line each. Monorepo releases are grouped. There's a "Show n more" and "11 pre-releases hidden".
   - **Evaluating:** one card per evaluating repo:
     - releases in 90 days, days since the last release, a 90-day release timeline (dots)
     - stars and change since the last run
     - a cadence label (Very active / Active / Slow / Stalled)
   - **Quiet:** a one-line list of repos that shipped nothing.
4. **Sidebar:**
   - **Run now** (window 1 / 7 / 14 / 30 days, "Email me" ticked by default)
   - **Download report**
   - **Past digests:** each shows the window, the kind (Monday auto-run / Daily security / Run now) and its counts. Show only the latest run per day; collapse the rest as "n earlier runs".
   - **Next Monday run** time

### `/repos`: Tracked repositories
- Grouped *Dependencies* / *Evaluating*, showing the avatar, `owner/name`, why, active, and the last error, if any.
- Admin only:
  - an **Add** textarea that accepts **several links or `owner/name` values separated by spaces, commas or new lines**. Each is validated live via `GET /repos/{o}/{r}` and saved with the canonical name. The result reads "Added 3 · already tracked 1 · not found 1".
  - per-row actions: category toggle, pause/resume, delete (with confirmation)
- **Team** panel (admin): add or remove teammates (name, email, role).

### `/report`: Downloads (admin)
- `GET /api/report?days=1|7|30&format=html|csv`. Built from stored `releases`, `tickets` and `digests`. **No Gemini call.**
  - **html:** a standalone, print-friendly report with the briefing, a summary table, flagged items with status and assignee, what was fixed in the period, quiet repos, and the run cost. "Save as PDF" works via the browser's Print.
  - **csv:** repo, category, tag, published_at, priority, flags, why, status, assignee, fixed_at, url.

### `/quality` (public)
- Runs `lib/rules.ts` on `seed/fixtures.json` (13 cases) live.
- Shows expected vs rules vs Gemini (last stored eval) vs final, plus scores: "rules only x/13", "rules + Gemini y/13", "security fixes missed", and "caught by Gemini only".
- Admin button: **Re-run Gemini evaluation** (one call, stored in `evals`).

### `/status` (public)
- Last run, next Monday run, active repos, AI cost this month.
- A runs table (kind, window, releases, tokens, ₹, errors).
- Each env var shown as set / missing (names only, never values).
- Repo errors.

### `/login`
- Passcode form that sets an httpOnly cookie, plus logout.

**Design** (I will refine the UI later; keep it clean and consistent):
- light background `#F6F6F3`, white cards, 1px `#E7E7E2` borders, 12px radius, Geist font (the `geist` npm package, so no Google Fonts fetch)
- chip colours: HIGH red `#DC2626`, MEDIUM amber `#D97706`, LOW slate `#64748B`, NOT SURE violet `#7C3AED`. Always with a **text label**, never colour alone.
- one shared `<ReleaseCard>` and `<Chip>` component used everywhere

---

## 8. API routes

| Route | Auth | Does |
|---|---|---|
| `GET /api/cron/weekly` | `Bearer CRON_SECRET` | `runDigest({days:7, kind:'weekly', email:true})` |
| `GET /api/cron/daily` | `Bearer CRON_SECRET` | `runDigest({days:1, kind:'daily-security'})`, then an alert email only for new HIGH security |
| `POST /api/run` | admin | manual run (`days`, `email`) |
| `POST /api/repos` · `PATCH/DELETE /api/repos/[id]` | admin | bulk add, validate, edit, delete |
| `PATCH /api/tickets/[id]` | admin | status, assignee, note → `ticket_events` → assignee email (with fallback) |
| `POST/DELETE /api/team` | admin | team edits |
| `GET /api/report` | admin | html/csv download |
| `POST /api/eval` | admin | Gemini eval over fixtures |

`vercel.json`:

```json
{"crons":[{"path":"/api/cron/weekly","schedule":"30 2 * * 1"},{"path":"/api/cron/daily","schedule":"0 3 * * *"}]}
```

That's Monday 08:00 IST and daily 08:30 IST. Set `export const maxDuration = 60` on run routes.

---

## 9. Emails (`lib/email.ts`, inline-styled HTML, one template family)

- **Digest:**
  - subject `🔴 2 need attention · Release Radar · 5–12 Oct`, or `✓ Nothing urgent · Release Radar · …`
  - body: briefing → HIGH cards → MEDIUM cards → a one-line list of LOW → quiet repos → "Open dashboard" and "Download report" links → run cost
- **Security alert** (daily): only the new HIGH security items.
- **Assignment:** "Keerthi assigned you: stripe/stripe-node v19.0.0 (HIGH · BREAKING)", with why, summary, note and links.

---

## 10. Phases (stop after each)

| # | Phase | Done when |
|---|---|---|
| 1 | Scaffold, Neon client, `lib/github.ts`, `lib/rules.ts` + `scripts/test-rules.ts` on `seed/fixtures.json` | the test prints 12/13 rules-only (F10 is the deliberate AI-only case) and F13 is **not** HIGH |
| 2 | Gemini + priorities + tickets + `runDigest`, plus `scripts/dry-run.ts 30` | a dry run against Neon prints counts per priority and creates tickets |
| 3 | Home: briefing, priority strip, tabs (Needs action / Fixed / All / Evaluating / Quiet), cards with assign, status and note, `/login` | marking a ticket Fixed moves it to the Fixed tab and it survives a re-run |
| 4 | `/repos` (bulk add, validation, categories) + Team panel, `/status`, `/quality` | adding 3 links at once works; status shows env set/missing |
| 5 | Emails (digest, alert, assignment with fallback) + `/api/report` html/csv + crons | the email arrives after Run now; the CSV opens in Excel; the HTML prints to PDF |
| 6 | Deploy to Vercel, set env, run **30 days** once, run the Gemini eval, write `README.md` | a public URL with real data on every tab |

**If time runs out, cut in this order:** the report HTML (keep CSV) → the Team panel (use seeded team) → the daily alert email. **Never cut:** the briefing, flags with "why", the tabs with Fixed, assignment, bulk add, the evaluating cards, and the weekly cron.

---

## 11. README (Phase 6)

Include:
- the problem in 3 lines
- the live URL and the components map image
- the pages
- **design decisions:** API not scraping; rules OR Gemini; ignoring example-only changes; one batched call; fail-safe; tickets keyed by release so Fixed sticks; daily security check closing the 11-day gap; public read and admin write
- setup in 6 steps
- the env table
- how Keerthi adds repos and assigns work

---

## 12. Credit-saving rules (strict)

- Don't read `node_modules`, lock files or build output. **Show diffs only**, never whole files.
- Don't keep a dev server running in a loop. Test logic with `tsx` scripts. Run `next build` once per phase.
- Generate each file once. **No refactors or restyles unless I ask.**
- Make at most **one** live Gemini call per test. The rules use fixtures, with no API calls.
- Ask before adding any package not in section 4.
- Keep memory in `NOTES.md` (≤ 40 lines: done / next / assumptions). Update it at the end of each phase. Commit as `phase-N: …` and push.
- Unknown API shape → log the raw response once (≤ 500 characters) and ask. Mark assumptions with `// ASSUME:`.
