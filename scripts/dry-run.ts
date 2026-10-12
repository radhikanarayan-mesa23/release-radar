// Live run against Neon + GitHub + Gemini. `npm run dry-run -- 30`
import { runDigest } from '../lib/pipeline';
import { sql } from '../lib/db';

const days = Number(process.argv[2] ?? 7);
const email = process.argv.includes('--email');

const missing = ['DATABASE_URL', 'GITHUB_TOKEN', 'GEMINI_API_KEY'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing env: ${missing.join(', ')} — put them in .env`);
  process.exit(1);
}

console.log(`Running ${days}-day digest (email=${email})…\n`);
const t0 = Date.now();
const { run_id, digest_id, payload, ai_ok, ai_error, emailed } = await runDigest({ days, kind: 'manual', email });

console.log(`run ${run_id} · digest ${digest_id} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`AI: ${ai_ok ? 'ok' : `FAILED (${ai_error}) — fell back to rule flags`}`);
console.log(`\ncounts ${JSON.stringify(payload.counts)}`);
console.log(`cost   ₹${payload.cost.inr} (${payload.cost.input_tokens} in / ${payload.cost.output_tokens} out)`);
console.log(`emailed ${emailed}`);

for (const p of ['HIGH', 'MEDIUM', 'NOT_SURE', 'LOW'] as const) {
  const rows = payload.items.filter((i) => i.priority === p);
  if (!rows.length) continue;
  console.log(`\n${p} (${rows.length})`);
  for (const i of rows.slice(0, 8)) {
    console.log(`  ${i.repo.padEnd(34)} ${i.tag.padEnd(16)} [${i.flags.join(',')}] ${i.why}`);
  }
  if (rows.length > 8) console.log(`  …${rows.length - 8} more`);
}

if (payload.evaluating.length) {
  console.log('\nEVALUATING');
  for (const e of payload.evaluating) {
    console.log(`  ${e.repo.padEnd(28)} ${String(e.releases_90d).padStart(2)} rel/90d · last ${e.days_since_last}d · ★${e.stars} (${e.stars_delta ?? '—'}) · ${e.cadence}`);
  }
}
if (payload.errors.length) {
  console.log('\nERRORS');
  payload.errors.forEach((e) => console.log(`  ${e.repo}: ${e.error}`));
}

const tickets = (await sql`
  select t.status, count(*)::int as n from tickets t group by t.status order by 1`) as { status: string; n: number }[];
console.log(`\ntickets ${tickets.map((t) => `${t.status}=${t.n}`).join(' ') || '(none)'}`);
console.log(`quiet ${payload.quiet.length} · prereleases hidden ${payload.counts.prerelease_hidden}`);
