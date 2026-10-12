import { checkCron } from '@/lib/auth';
import { runDigest } from '@/lib/pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!checkCron(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const r = await runDigest({ days: 7, kind: 'weekly', email: true });
  return Response.json({ ok: true, run_id: r.run_id, counts: r.payload.counts, emailed: r.emailed });
}
