/**
 * Spend guards. The app is public and the demo passcode is published, so the
 * costly endpoints need hard caps or one crawler could exhaust the Gemini quota
 * before anyone reviews the site.
 *
 * Every limit is an env var, so they can be raised without a redeploy.
 * Crons are never blocked — the Monday digest must always go out.
 */
import { createHash } from 'node:crypto';
import { sql } from './db';

const num = (k: string, d: number) => Number(process.env[k] ?? d) || d;

export const LIMITS = {
  geminiCallsPerDay: () => num('CAP_GEMINI_CALLS_PER_DAY', 200),
  chatPerIpPerHour: () => num('CAP_CHAT_PER_IP_HOUR', 15),
  chatPerDay: () => num('CAP_CHAT_PER_DAY', 150),
  runPerDay: () => num('CAP_RUN_PER_DAY', 24),
  runCooldownSec: () => num('CAP_RUN_COOLDOWN_SEC', 180),
};

export function ipHash(req: Request): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`rr:${ip}`).digest('hex').slice(0, 32);
}

/** Returns null when allowed, or a human message explaining the cap. */
export async function checkBudget(kind: 'chat' | 'run' | 'eval', req: Request): Promise<string | null> {
  const hash = ipHash(req);
  try {
    const rows = (await sql`
      select
        (select count(*)::int from usage_events where at > now() - interval '1 day')                        as ai_day,
        (select count(*)::int from usage_events where kind = ${kind} and at > now() - interval '1 day')     as kind_day,
        (select count(*)::int from usage_events
           where kind = ${kind} and ip_hash = ${hash} and at > now() - interval '1 hour')                   as kind_ip_hour,
        (select extract(epoch from (now() - max(at)))::int from usage_events where kind = 'run')            as since_run
    `) as { ai_day: number; kind_day: number; kind_ip_hour: number; since_run: number | null }[];
    const r = rows[0];

    if (r.ai_day >= LIMITS.geminiCallsPerDay()) {
      return 'Daily AI budget reached for this demo. The dashboard, reports and all stored data still work — AI answers resume tomorrow.';
    }
    if (kind === 'chat') {
      if (r.kind_ip_hour >= LIMITS.chatPerIpPerHour()) {
        return `That's ${LIMITS.chatPerIpPerHour()} questions this hour — the demo caps it there to protect the AI quota. Try again shortly.`;
      }
      if (r.kind_day >= LIMITS.chatPerDay()) {
        return 'The assistant has hit its daily question cap for this demo. Everything else on the dashboard still works.';
      }
    }
    if (kind === 'run') {
      if (r.since_run !== null && r.since_run < LIMITS.runCooldownSec()) {
        const wait = LIMITS.runCooldownSec() - r.since_run;
        return `A run finished ${r.since_run}s ago. Runs are spaced ${LIMITS.runCooldownSec()}s apart so repeated clicks cannot drain the quota — try again in ${wait}s.`;
      }
      if (r.kind_day >= LIMITS.runPerDay()) {
        return 'Daily run limit reached for this demo. The stored digest, reports and tabs all still work.';
      }
    }
    return null;
  } catch {
    return null; // never block on a bookkeeping failure
  }
}

export async function recordUsage(kind: 'chat' | 'run' | 'eval', req: Request): Promise<void> {
  try {
    await sql`insert into usage_events (kind, ip_hash) values (${kind}, ${ipHash(req)})`;
  } catch { /* bookkeeping only */ }
}

/** Counts for /status. */
export async function usageToday() {
  try {
    const rows = (await sql`
      select kind, count(*)::int as n from usage_events
      where at > now() - interval '1 day' group by kind order by 1`) as { kind: string; n: number }[];
    return rows;
  } catch { return []; }
}
