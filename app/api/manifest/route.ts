import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { parseManifest } from '@/lib/manifest';

export const dynamic = 'force-dynamic';

const Body = z.object({ text: z.string().min(2).max(400_000) });

export async function GET() {
  const rows = (await sql`
    select count(*)::int as n, max(updated_at) as updated_at from manifest_deps`) as
    { n: number; updated_at: string | null }[];
  return Response.json({ count: rows[0].n, updated_at: rows[0].updated_at });
}

/** Replace the stored dependency list with the one in a pasted package.json. */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: 'Paste your package.json' }, { status: 400 });

  let deps;
  try {
    deps = parseManifest(parsed.data.text);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not read that' }, { status: 400 });
  }
  if (!deps.length) return Response.json({ error: 'No dependencies found in that file.' }, { status: 400 });

  // Ranges only — names and semver ranges, never a lockfile and never source.
  await sql`delete from manifest_deps`;
  for (const d of deps) {
    await sql`
      insert into manifest_deps (name, range, dev) values (${d.name}, ${d.range}, ${d.dev})
      on conflict (name) do update set range = excluded.range, dev = excluded.dev, updated_at = now()`;
  }
  return Response.json({
    ok: true, count: deps.length,
    dependencies: deps.filter((d) => !d.dev).length,
    devDependencies: deps.filter((d) => d.dev).length,
  });
}

export async function DELETE() {
  const denied = await requireAdmin();
  if (denied) return denied;
  await sql`delete from manifest_deps`;
  return Response.json({ ok: true });
}
