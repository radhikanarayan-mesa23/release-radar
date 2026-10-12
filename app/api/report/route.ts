import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { esc } from '@/lib/email';

export const dynamic = 'force-dynamic';

interface Row {
  repo: string; category: string; tag: string; published_at: string | null;
  priority: string | null; flags: string[]; why: string | null; url: string | null;
  status: string | null; assignee: string | null; fixed_at: string | null;
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const u = new URL(req.url);
  const days = [1, 7, 30].includes(Number(u.searchParams.get('days'))) ? Number(u.searchParams.get('days')) : 7;
  const format = u.searchParams.get('format') === 'csv' ? 'csv' : 'html';
  const since = new Date(Date.now() - days * 86400000).toISOString();

  const rows = (await sql`
    select (p.owner || '/' || p.name) as repo, p.category, r.tag, r.published_at,
           r.priority, r.flags, r.why, r.url,
           t.status, t.fixed_at, m.name as assignee
    from releases r
    join repos p on p.id = r.repo_id
    left join tickets t on t.release_id = r.id
    left join team m on m.id = t.assignee_id
    where r.published_at >= ${since}
    order by case r.priority when 'HIGH' then 0 when 'MEDIUM' then 1 when 'NOT_SURE' then 2 else 3 end,
             r.published_at desc`) as Row[];

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const head = ['repo', 'category', 'tag', 'published_at', 'priority', 'flags', 'why', 'status', 'assignee', 'fixed_at', 'url'];
    const body = rows.map((r) => [
      r.repo, r.category, r.tag, r.published_at ?? '', r.priority ?? '',
      (r.flags ?? []).join(' '), r.why ?? '', r.status ?? '', r.assignee ?? '', r.fixed_at ?? '', r.url ?? '',
    ].map(csvCell).join(','));
    return new Response(['﻿' + head.join(','), ...body].join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="release-radar-${days}d-${stamp}.csv"`,
      },
    });
  }

  const digest = ((await sql`
    select briefing, counts, window_from, window_to, created_at
    from digests order by created_at desc limit 1`) as {
      briefing: { priority: string; text: string }[]; counts: Record<string, number>;
      window_from: string; window_to: string; created_at: string;
    }[])[0];
  const cost = ((await sql`
    select coalesce(sum(cost_inr),0)::float as inr, coalesce(sum(gemini_input_tokens+gemini_output_tokens),0)::int as tokens
    from runs where started_at >= ${since}`) as { inr: number; tokens: number }[])[0];
  const quiet = (await sql`
    select (p.owner || '/' || p.name) as repo from repos p
    where p.active = true and not exists (
      select 1 from releases r where r.repo_id = p.id and r.published_at >= ${since})
    order by 1`) as { repo: string }[];

  const flagged = rows.filter((r) => r.priority === 'HIGH' || r.priority === 'MEDIUM' || r.priority === 'NOT_SURE');
  const fixed = rows.filter((r) => r.status === 'fixed');
  const n = (p: string) => rows.filter((r) => r.priority === p).length;

  const html = `<!doctype html><html lang="en"><meta charset="utf-8">
<title>Release Radar · last ${days} days</title>
<style>
 @page { margin: 16mm }
 body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111827;background:#fff;margin:0;padding:24px}
 .wrap{max-width:860px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px} h2{font-size:15px;margin:26px 0 8px}
 .muted{color:#6B7280} table{width:100%;border-collapse:collapse;margin-top:6px}
 th,td{border:1px solid #E7E7E2;padding:6px 8px;text-align:left;vertical-align:top;font-size:12px}
 th{background:#F6F6F3} .HIGH{color:#DC2626;font-weight:700} .MEDIUM{color:#D97706;font-weight:700}
 .NOT_SURE{color:#7C3AED;font-weight:700} .LOW{color:#64748B}
 .btn{border:1px solid #E7E7E2;border-radius:8px;padding:6px 10px;background:#fff;cursor:pointer}
 @media print{.no-print{display:none}}
</style>
<div class="wrap">
 <button class="btn no-print" onclick="print()">Save as PDF</button>
 <h1>Release Radar</h1>
 <p class="muted">Last ${days} days · generated ${d(new Date().toISOString())} · ${rows.length} releases across ${new Set(rows.map((r) => r.repo)).size} repos</p>
 ${digest?.briefing?.length ? `<h2>Briefing</h2><ul>${digest.briefing.map((b) => `<li><span class="${esc(b.priority)}">${esc(b.priority)}</span> ${esc(b.text)}</li>`).join('')}</ul>` : ''}
 <h2>Summary</h2>
 <table><tr><th>High</th><th>Medium</th><th>Not sure</th><th>Low</th><th>Quiet repos</th><th>AI cost</th></tr>
 <tr><td class="HIGH">${n('HIGH')}</td><td class="MEDIUM">${n('MEDIUM')}</td><td class="NOT_SURE">${n('NOT_SURE')}</td><td class="LOW">${n('LOW')}</td><td>${quiet.length}</td><td>₹${(cost?.inr ?? 0).toFixed(4)} · ${cost?.tokens ?? 0} tokens</td></tr></table>
 <h2>Flagged items (${flagged.length})</h2>
 <table><tr><th>Repo</th><th>Version</th><th>Date</th><th>Priority</th><th>Flags</th><th>Why</th><th>Status</th><th>Assignee</th></tr>
 ${flagged.map((r) => `<tr><td>${esc(r.repo)}</td><td>${esc(r.tag)}</td><td>${d(r.published_at)}</td>
   <td class="${esc(r.priority ?? '')}">${esc((r.priority ?? '').replace('_', ' '))}</td>
   <td>${esc((r.flags ?? []).join(', '))}</td><td>${esc(r.why ?? '')}</td>
   <td>${esc(r.status ?? '—')}</td><td>${esc(r.assignee ?? '—')}</td></tr>`).join('') || '<tr><td colspan="8">Nothing flagged.</td></tr>'}
 </table>
 <h2>Fixed in this period (${fixed.length})</h2>
 <table><tr><th>Repo</th><th>Version</th><th>Fixed on</th><th>By / assignee</th></tr>
 ${fixed.map((r) => `<tr><td>${esc(r.repo)}</td><td>${esc(r.tag)}</td><td>${d(r.fixed_at)}</td><td>${esc(r.assignee ?? '—')}</td></tr>`).join('') || '<tr><td colspan="4">Nothing closed yet.</td></tr>'}
 </table>
 <h2>Quiet repos (${quiet.length})</h2>
 <p class="muted">${quiet.map((q) => esc(q.repo)).join(', ') || 'None — every repo shipped.'}</p>
 <p class="muted" style="margin-top:28px">Release Radar · public GitHub REST API · Gemini Flash · Neon</p>
</div></html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="release-radar-${days}d-${stamp}.html"`,
    },
  });
}
