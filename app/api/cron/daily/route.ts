import { checkCron } from '@/lib/auth';
import { runDigest } from '@/lib/pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Daily security sweep. Emails only when a new HIGH security item appears. */
export async function GET(req: Request) {
  if (!checkCron(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const r = await runDigest({ days: 1, kind: 'daily-security' });
  return Response.json({ ok: true, run_id: r.run_id, counts: r.payload.counts, alerted: r.emailed });
}
