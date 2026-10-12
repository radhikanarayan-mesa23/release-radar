import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { sendDigest, type DigestPayload } from '@/lib/pipeline';

export const dynamic = 'force-dynamic';

/** Re-send the latest stored digest. No GitHub fetch, no Gemini call, no cost. */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const rows = (await sql`select payload from digests order by created_at desc limit 1`) as
    { payload: DigestPayload }[];
  if (!rows.length) return Response.json({ error: 'No digest yet — run one first' }, { status: 404 });

  const res = await sendDigest(rows[0].payload);
  return res.ok
    ? Response.json({ ok: true, to: res.to })
    : Response.json({ error: res.error ?? 'Send failed' }, { status: 502 });
}
