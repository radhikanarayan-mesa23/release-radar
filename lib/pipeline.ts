// runDigest(): fetch -> rules -> one Gemini call -> priority -> upsert -> tickets -> digest -> email.
import { sql } from './db';
import {
  getRepo, listReleases, listTags, getCommitDate, listAdvisories, pool, avatarUrl,
  GhError, type GhRelease,
} from './github';
import { applyRules, priorityFromRules, type Bump, type Category, type Priority } from './rules';
import { classify, costInr, selectForAi, type GeminiInput, type GeminiOut } from './gemini';
import { briefingBlock, card, esc, sendTo, shell, type MailItem } from './email';

export type RunKind = 'weekly' | 'daily-security' | 'manual';

export interface RepoRow {
  id: number; owner: string; name: string; category: Category; why: string | null; active: boolean;
}

export interface DigestItem {
  release_id: number | null;
  repo_id: number; repo: string; owner: string; category: Category; avatar: string;
  tag: string; title: string; url: string; published_at: string | null;
  prerelease: boolean; source: 'release' | 'tag' | 'advisory';
  bump: Bump; rule_flags: string[]; ai_flags: string[]; flags: string[];
  priority: Priority; confidence: number | null; summary: string[]; why: string; action: string;
}

export interface EvaluatingStat {
  repo: string; avatar: string; why: string | null;
  releases_90d: number; days_since_last: number | null; timeline: string[];
  stars: number | null; stars_delta: number | null; cadence: string;
}

export interface DigestPayload {
  kind: RunKind; generated_at: string;
  window: { from: string; to: string; days: number };
  ai_ok: boolean; ai_banner: string | null;
  briefing: { priority: string; text: string }[];
  counts: { HIGH: number; MEDIUM: number; LOW: number; NOT_SURE: number; total: number; quiet: number; prerelease_hidden: number };
  items: DigestItem[];
  evaluating: EvaluatingStat[];
  quiet: { repo: string; category: Category; why: string | null }[];
  errors: { repo: string; error: string }[];
  cost: { input_tokens: number; output_tokens: number; inr: number };
}

const DAY = 86_400_000;

function cadenceLabel(releases90: number, daysSince: number | null): string {
  if (daysSince === null) return 'Stalled';
  if (releases90 >= 12 || daysSince <= 7) return 'Very active';
  if (releases90 >= 4 || daysSince <= 30) return 'Active';
  if (daysSince <= 90) return 'Slow';
  return 'Stalled';
}

interface Collected {
  repo: RepoRow;
  raw: {
    tag: string; title: string; body: string; url: string;
    published_at: string | null; prerelease: boolean;
    source: 'release' | 'tag' | 'advisory'; prev_tag: string | null;
    extra_flags: string[];
  }[];
  evaluating: EvaluatingStat | null;
  error: string | null;
}

async function collect(repo: RepoRow, since: Date): Promise<Collected> {
  const out: Collected = { repo, raw: [], evaluating: null, error: null };
  const full = `${repo.owner}/${repo.name}`;
  try {
    const all = (await listReleases(repo.owner, repo.name))
      .filter((r) => !r.draft)
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));

    const inWindow = all.filter((r) => r.published_at && new Date(r.published_at) >= since);
    const prevOf = (r: GhRelease) => all[all.indexOf(r) + 1]?.tag_name ?? null;

    for (const r of inWindow) {
      out.raw.push({
        tag: r.tag_name, title: r.name ?? r.tag_name, body: r.body ?? '',
        url: r.html_url, published_at: r.published_at, prerelease: r.prerelease,
        source: 'release', prev_tag: prevOf(r), extra_flags: [],
      });
    }

    // No releases at all -> fall back to tags + their commit dates.
    if (all.length === 0) {
      const tags = await listTags(repo.owner, repo.name);
      const dated = await pool(tags, 3, async (t) => ({
        t, date: await getCommitDate(repo.owner, repo.name, t.commit.sha).catch(() => null),
      }));
      dated
        .filter((d) => d.date && new Date(d.date) >= since)
        .forEach((d, i, arr) => out.raw.push({
          tag: d.t.name, title: d.t.name, body: '', url: `https://github.com/${full}/releases/tag/${d.t.name}`,
          published_at: d.date, prerelease: false, source: 'tag',
          prev_tag: arr[i + 1]?.t.name ?? null, extra_flags: [],
        }));
    }

    // Published advisories in the window: flag the newest release, else stand alone.
    const advisories = (await listAdvisories(repo.owner, repo.name))
      .filter((a) => a.published_at && new Date(a.published_at) >= since);
    for (const a of advisories) {
      const newest = out.raw.find((r) => r.source === 'release');
      if (newest) {
        newest.extra_flags.push('SECURITY');
        newest.body = `${newest.body}\n${a.ghsa_id}: ${a.summary}`.trim();
      } else {
        out.raw.push({
          tag: a.ghsa_id, title: a.summary, body: a.description ?? a.summary,
          url: a.html_url, published_at: a.published_at, prerelease: false,
          source: 'advisory', prev_tag: null, extra_flags: ['SECURITY'],
        });
      }
    }

    if (repo.category === 'evaluating') {
      const meta = await getRepo(repo.owner, repo.name);
      const prev = (await sql`
        select stars from star_snapshots where repo_id = ${repo.id}
        order by taken_at desc limit 1`) as { stars: number }[];
      await sql`insert into star_snapshots (repo_id, stars) values (${repo.id}, ${meta.stargazers_count})`;

      const cutoff = Date.now() - 90 * DAY;
      const recent = all.filter((r) => r.published_at && new Date(r.published_at).getTime() >= cutoff);
      const last = all.find((r) => r.published_at)?.published_at ?? null;
      const daysSince = last ? Math.floor((Date.now() - new Date(last).getTime()) / DAY) : null;
      out.evaluating = {
        repo: full, avatar: avatarUrl(repo.owner), why: repo.why,
        releases_90d: recent.length, days_since_last: daysSince,
        timeline: recent.map((r) => r.published_at!).reverse(),
        stars: meta.stargazers_count,
        stars_delta: prev.length ? meta.stargazers_count - prev[0].stars : null,
        cadence: cadenceLabel(recent.length, daysSince),
      };
    }
  } catch (e) {
    const msg = e instanceof GhError
      ? (e.status === 404 ? 'Repository not found (renamed or deleted)' : e.message)
      : e instanceof Error ? e.message : String(e);
    out.error = msg;
  }
  return out;
}

export async function runDigest(opts: { days: number; kind: RunKind; email?: boolean }) {
  const days = opts.days;
  const kind = opts.kind;
  const wantEmail = opts.email ?? (kind === 'weekly' || kind === 'manual');
  const to = new Date();
  const since = new Date(to.getTime() - days * DAY);

  const runRows = (await sql`
    insert into runs (kind, window_days) values (${kind}, ${days}) returning id`) as { id: number }[];
  const runId = runRows[0].id;

  const repos = (await sql`
    select id, owner, name, category, why, active from repos
    where active = true order by category, lower(owner), lower(name)`) as RepoRow[];

  const collected = await pool(repos, 5, (r) => collect(r, since));

  // --- rules ---
  interface Staged { c: Collected; r: Collected['raw'][number]; bump: Bump; rule_flags: string[]; why: string; prerelease: boolean; key: string }
  const staged: Staged[] = [];
  for (const c of collected) {
    for (const r of c.raw) {
      const res = applyRules({ tag: r.tag, prev_tag: r.prev_tag, title: r.title, body: r.body, prerelease: r.prerelease });
      const rule_flags = Array.from(new Set([...res.flags, ...r.extra_flags]));
      staged.push({
        c, r, bump: res.bump, rule_flags, prerelease: res.prerelease,
        why: r.extra_flags.includes('SECURITY') && !res.flags.includes('SECURITY')
          ? 'Published GitHub security advisory in this window'
          : res.why,
        key: `${c.repo.id}:${r.tag}`,
      });
    }
  }

  // --- one Gemini call ---
  const forAi = selectForAi(staged.map((s) => ({
    id: s.key, repo: `${s.c.repo.owner}/${s.c.repo.name}`, category: s.c.repo.category,
    tag: s.r.tag, title: s.r.title, body: s.r.body, rule_flags: s.rule_flags,
    published_at: s.r.published_at,
  }))) as (GeminiInput & { published_at: string | null })[];

  const ai = await classify(forAi);
  const byId = new Map(ai.data.items.map((i) => [i.id, i]));

  // --- merge, priority, upsert, tickets ---
  const items: DigestItem[] = [];
  for (const s of staged) {
    const g = byId.get(s.key);
    const ai_flags: string[] = [];
    if (g?.is_security) ai_flags.push('SECURITY');
    if (g?.is_breaking) ai_flags.push('BREAKING');
    const flags = Array.from(new Set([...s.rule_flags, ...ai_flags])); // rules OR ai, never subtract

    let priority = priorityFromRules({
      flags, bump: s.bump, prerelease: s.prerelease, category: s.c.repo.category,
    });
    if (g) {
      // ASSUME: NOT_SURE only when nothing at all is flagged (a flagged-but-unsure
      // item stays at its flag priority, which is the safe direction).
      if (!flags.length && g.confidence < 0.6) priority = 'NOT_SURE';
      else if (!flags.length && g.action === 'no action') priority = 'LOW';
    }

    const summary = g?.summary?.length
      ? g.summary.slice(0, 2)
      : s.r.body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 2);
    const why = g?.why?.trim() || s.why;

    const rows = (await sql`
      insert into releases (repo_id, tag, title, body, url, published_at, prerelease, source,
        bump, rule_flags, ai_flags, flags, priority, confidence, summary, why, action)
      values (${s.c.repo.id}, ${s.r.tag}, ${s.r.title}, ${s.r.body.slice(0, 20000)}, ${s.r.url},
        ${s.r.published_at}, ${s.prerelease}, ${s.r.source}, ${s.bump},
        ${s.rule_flags as unknown as string}::text[], ${ai_flags as unknown as string}::text[],
        ${flags as unknown as string}::text[], ${priority}, ${g?.confidence ?? null},
        ${JSON.stringify(summary)}::jsonb, ${why}, ${g?.action ?? null})
      on conflict (repo_id, tag) do update set
        title = excluded.title, body = excluded.body, url = excluded.url,
        published_at = excluded.published_at, prerelease = excluded.prerelease,
        bump = excluded.bump, rule_flags = excluded.rule_flags, ai_flags = excluded.ai_flags,
        flags = excluded.flags, priority = excluded.priority, confidence = excluded.confidence,
        summary = excluded.summary, why = excluded.why, action = excluded.action
      returning id`) as { id: number }[];
    const release_id = rows[0].id;

    // Tickets are keyed by release so triage survives every later run.
    if (priority === 'HIGH' || priority === 'MEDIUM' || priority === 'NOT_SURE') {
      await sql`
        insert into tickets (release_id, status, priority) values (${release_id}, 'open', ${priority})
        on conflict (release_id) do update set priority = excluded.priority, updated_at = now()`;
    }

    items.push({
      release_id, repo_id: s.c.repo.id, repo: `${s.c.repo.owner}/${s.c.repo.name}`,
      owner: s.c.repo.owner, category: s.c.repo.category, avatar: avatarUrl(s.c.repo.owner),
      tag: s.r.tag, title: s.r.title, url: s.r.url, published_at: s.r.published_at,
      prerelease: s.prerelease, source: s.r.source, bump: s.bump,
      rule_flags: s.rule_flags, ai_flags, flags, priority,
      confidence: g?.confidence ?? null, summary, why, action: g?.action ?? '',
    });
  }

  // Pre-releases are hidden unless flagged.
  const hidden = items.filter((i) => i.prerelease && i.flags.length === 0);
  const visible = items.filter((i) => !(i.prerelease && i.flags.length === 0));

  const loud = new Set(visible.map((i) => i.repo_id));
  const quiet = collected
    .filter((c) => !loud.has(c.repo.id) && !c.error)
    .map((c) => ({ repo: `${c.repo.owner}/${c.repo.name}`, category: c.repo.category, why: c.repo.why }));
  const errors = collected.filter((c) => c.error)
    .map((c) => ({ repo: `${c.repo.owner}/${c.repo.name}`, error: c.error! }));

  const counts = {
    HIGH: visible.filter((i) => i.priority === 'HIGH').length,
    MEDIUM: visible.filter((i) => i.priority === 'MEDIUM').length,
    LOW: visible.filter((i) => i.priority === 'LOW').length,
    NOT_SURE: visible.filter((i) => i.priority === 'NOT_SURE').length,
    total: visible.length,
    quiet: quiet.length,
    prerelease_hidden: hidden.length,
  };

  const briefing = ai.data.briefing.length ? ai.data.briefing : fallbackBriefing(visible);

  const payload: DigestPayload = {
    kind, generated_at: new Date().toISOString(),
    window: { from: since.toISOString(), to: to.toISOString(), days },
    ai_ok: ai.ok,
    ai_banner: ai.ok ? null : 'AI summary unavailable: flags from rules only',
    briefing, counts, items: visible,
    evaluating: collected.map((c) => c.evaluating).filter(Boolean) as EvaluatingStat[],
    quiet, errors,
    cost: { input_tokens: ai.input_tokens, output_tokens: ai.output_tokens, inr: costInr(ai.input_tokens, ai.output_tokens) },
  };

  const digestRows = (await sql`
    insert into digests (run_id, kind, window_days, window_from, window_to, briefing, counts, payload)
    values (${runId}, ${kind}, ${days}, ${since.toISOString()}, ${to.toISOString()},
      ${JSON.stringify(briefing)}::jsonb, ${JSON.stringify(counts)}::jsonb, ${JSON.stringify(payload)}::jsonb)
    returning id`) as { id: number }[];

  // --- email ---
  let emailed = false;
  if (kind === 'daily-security') {
    const newHigh = visible.filter((i) => i.priority === 'HIGH' && i.flags.includes('SECURITY'));
    if (newHigh.length) emailed = (await sendAlert(newHigh)).ok;
  } else if (wantEmail) {
    emailed = (await sendDigest(payload)).ok;
  }

  await sql`
    update runs set finished_at = now(), repos_checked = ${repos.length},
      releases_found = ${visible.length}, gemini_input_tokens = ${ai.input_tokens},
      gemini_output_tokens = ${ai.output_tokens}, cost_inr = ${payload.cost.inr},
      emailed = ${emailed}, errors = ${JSON.stringify(errors)}::jsonb
    where id = ${runId}`;

  return { run_id: runId, digest_id: digestRows[0].id, payload, emailed, ai_ok: ai.ok, ai_error: ai.error };
}

function fallbackBriefing(items: DigestItem[]) {
  const pick = (p: Priority) => items.filter((i) => i.priority === p).slice(0, 3);
  const out: { priority: string; text: string }[] = [];
  for (const p of ['HIGH', 'MEDIUM'] as Priority[]) {
    for (const i of pick(p)) out.push({ priority: p, text: `${i.repo} ${i.tag}: ${i.why}` });
  }
  const low = items.filter((i) => i.priority === 'LOW').length;
  if (low) out.push({ priority: 'LOW', text: `${low} routine release${low > 1 ? 's' : ''}, no action needed.` });
  if (!out.length) out.push({ priority: 'LOW', text: 'Nothing urgent this window.' });
  return out.slice(0, 5);
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const toMail = (i: DigestItem): MailItem => ({ ...i });

export async function sendDigest(p: DigestPayload) {
  const to = process.env.DIGEST_TO;
  if (!to) return { ok: false, to: '', error: 'DIGEST_TO not set' };
  const need = p.counts.HIGH + p.counts.MEDIUM + p.counts.NOT_SURE;
  const range = `${fmt(p.window.from)}–${fmt(p.window.to)}`;
  const subject = need
    ? `🔴 ${need} need attention · Release Radar · ${range}`
    : `✓ Nothing urgent · Release Radar · ${range}`;

  const high = p.items.filter((i) => i.priority === 'HIGH');
  const med = p.items.filter((i) => i.priority === 'MEDIUM' || i.priority === 'NOT_SURE');
  const low = p.items.filter((i) => i.priority === 'LOW');

  const inner = [
    p.ai_banner ? `<p style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:8px 12px;font-size:13px">${esc(p.ai_banner)}</p>` : '',
    briefingBlock(p.briefing),
    high.length ? `<h2 style="font-size:15px;margin:18px 0 8px">High (${high.length})</h2>${high.map((i) => card(toMail(i))).join('')}` : '',
    med.length ? `<h2 style="font-size:15px;margin:18px 0 8px">Medium (${med.length})</h2>${med.map((i) => card(toMail(i))).join('')}` : '',
    low.length ? `<h2 style="font-size:15px;margin:18px 0 8px">Routine (${low.length})</h2><ul style="margin:0 0 0 18px;padding:0;font-size:13px">${low.map((i) => `<li>${esc(i.repo)} ${esc(i.tag)}</li>`).join('')}</ul>` : '',
    p.quiet.length ? `<p style="font-size:13px;color:#6B7280;margin-top:16px">Quiet (${p.quiet.length}): ${p.quiet.map((q) => esc(q.repo)).join(', ')}</p>` : '',
    p.counts.prerelease_hidden ? `<p style="font-size:13px;color:#6B7280">${p.counts.prerelease_hidden} pre-releases hidden</p>` : '',
    `<p style="font-size:12px;color:#6B7280">AI cost this run: ₹${p.cost.inr} · ${p.cost.input_tokens + p.cost.output_tokens} tokens</p>`,
  ].join('');

  return sendTo(to, subject, shell(`${need} need attention · ${range}`, inner));
}

export async function sendAlert(items: DigestItem[]) {
  const to = process.env.DIGEST_TO;
  if (!to) return { ok: false, to: '', error: 'DIGEST_TO not set' };
  const inner = items.map((i) => card(toMail(i))).join('');
  return sendTo(to, `🔴 Security: ${items.length} new high-priority release${items.length > 1 ? 's' : ''}`,
    shell('New security releases', inner));
}
