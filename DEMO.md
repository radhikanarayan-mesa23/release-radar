# Demo video script — Release Radar (~2 min)

**Live:** https://release-radar-radhi2.vercel.app · **Repo:** https://github.com/radhikanarayan-mesa23/release-radar

Record in this order. Everything below is real data already in the database — nothing needs setting up.

---

### 0:00 — The problem (10s, on the dashboard)
> "Keerthi watches 24 public repos — payment gateways, auth libraries, banking APIs.
> GitHub Watch is a firehose. Last quarter a security patch sat unread for 11 days.
> This is what she opens on Monday morning."

### 0:10 — Key metrics (15s)
Point at the tiles.
> "38 need attention — 27 high, 10 medium, 1 the model wasn't sure about.
> 29 routine releases it decided she can ignore, and 7 of her 24 repos shipped nothing."

Click **HIGH** → the list filters.
> "Every tile filters the queue."

### 0:25 — Focus + key insights (20s)
> "The briefing comes first, written by Gemini Flash, grouped high to low —
> 'immediately patch OpenSSL, Keycloak, Express, Fastify and Hono'.
> 'Start here' links straight to the top three."

### 0:45 — A card, and *why* (20s)
Open a HIGH card.
> "Security and breaking chips, the version, the date — and 'Why this colour?',
> which is either the rule that fired or Gemini's reason. Never a colour on its own."

### 1:05 — Assign and resolve (20s)
Click **Unlock admin** (one click, passcode pre-filled). Assign to Meera → status **Fixed**.
> "Assign it, note it, mark it fixed — the assignee gets an email, and it moves to
> Previous issues. Tickets are keyed by repo plus tag, so Fixed stays fixed in every later run."

Click **Previous issues** to show it landed.

### 1:25 — Repos, export, email (20s)
Go to **/repos**.
> "Dependencies and Evaluating, editable without touching code — paste a dozen GitHub links
> at once and each is validated live against the API."

Back on the dashboard, point at the sidebar: **Run now · Email me this digest · Export CSV**.

### 1:45 — Trust and automation (15s)
Go to **/quality**.
> "13 fixtures graded live. Rules alone get 12 of 13. Rules plus Gemini get 13 — zero security
> fixes missed, zero false alarms. F13 fixes a CVE inside /examples, so it must *not* be high,
> and it isn't."

Then **/status**.
> "Every run logged with tokens and rupees. And it runs itself — Monday 08:00 IST,
> plus a daily security sweep at 08:30. That's the 11-day gap, closed."

---

### If you only have 60 seconds
Dashboard tiles → key insights → one HIGH card's "why" → assign + Fixed → `/quality` 13/13.
