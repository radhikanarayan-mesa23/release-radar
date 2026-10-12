import { requireAdmin } from '@/lib/auth';
import { runDigest } from '@/lib/pipeline';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const days = [1, 7, 14, 30].includes(Number(body.days)) ? Number(body.days) : 7;
  const email = body.email !== false;
  try {
    const r = await runDigest({ days, kind: 'manual', email });
    return Response.json({
      ok: true, run_id: r.run_id, counts: r.payload.counts,
      emailed: r.emailed, ai_ok: r.ai_ok, cost: r.payload.cost,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
