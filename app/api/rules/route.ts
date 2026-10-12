import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import {
  DEFAULT_BREAKING_TERMS, DEFAULT_IGNORE_TERMS, DEFAULT_SECURITY_TERMS, type RuleConfig,
} from '@/lib/rules';

export const dynamic = 'force-dynamic';

const Terms = z.array(z.string().min(1).max(120)).max(80);
const Body = z.object({
  security_terms: Terms.nullable().optional(),
  breaking_terms: Terms.nullable().optional(),
  ignore_terms: Terms.nullable().optional(),
});

export async function ruleConfig(): Promise<RuleConfig> {
  try {
    const rows = (await sql`
      select security_terms, breaking_terms, ignore_terms from rule_config where id = 1`) as RuleConfig[];
    return rows[0] ?? {};
  } catch { return {}; }
}

export async function GET() {
  const cfg = await ruleConfig();
  return Response.json({
    security_terms: cfg.security_terms ?? DEFAULT_SECURITY_TERMS,
    breaking_terms: cfg.breaking_terms ?? DEFAULT_BREAKING_TERMS,
    ignore_terms: cfg.ignore_terms ?? DEFAULT_IGNORE_TERMS,
    customised: {
      security: !!cfg.security_terms, breaking: !!cfg.breaking_terms, ignore: !!cfg.ignore_terms,
    },
    defaults: {
      security_terms: DEFAULT_SECURITY_TERMS,
      breaking_terms: DEFAULT_BREAKING_TERMS,
      ignore_terms: DEFAULT_IGNORE_TERMS,
    },
  });
}

/** null for a list means "use the default in code". */
export async function PUT(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: 'Terms must be 1–120 characters, 80 max per list.' }, { status: 400 });

  // Reject anything that is not a valid regular expression before it can break a run.
  for (const [k, v] of Object.entries(p.data)) {
    if (!v) continue;
    for (const term of v) {
      try { new RegExp(term); }
      catch { return Response.json({ error: `"${term}" in ${k.replace('_terms', '')} is not a valid pattern.` }, { status: 400 }); }
    }
  }

  const { security_terms = null, breaking_terms = null, ignore_terms = null } = p.data;
  await sql`
    update rule_config set
      security_terms = ${security_terms as unknown as string}::text[],
      breaking_terms = ${breaking_terms as unknown as string}::text[],
      ignore_terms   = ${ignore_terms as unknown as string}::text[],
      updated_at = now(), updated_by = 'Keerthi'
    where id = 1`;
  return Response.json({ ok: true });
}
