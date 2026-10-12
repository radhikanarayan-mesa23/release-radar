import fixtures from '@/seed/fixtures.json';
import { applyRules, priorityFromRules, type Priority } from './rules';

export interface Fixture {
  id: string; repo: string; tag: string; prev_tag: string; title: string; body: string;
  expect: { bump: string; flags: string[]; priority: string; prerelease?: boolean; _why?: string };
}
export const CASES = (fixtures as { cases: Fixture[] }).cases;

export interface QualityRow {
  id: string; repo: string; tag: string;
  expected: { flags: string[]; priority: string };
  rules: { flags: string[]; priority: Priority; why: string };
  ai: { flags: string[]; why: string; confidence: number } | null;
  final: { flags: string[]; priority: Priority };
  rulesOk: boolean; finalOk: boolean;
}

export type EvalItem = { id: string; is_security: boolean; is_breaking: boolean; why: string; confidence: number };

/** Rules on every fixture, optionally merged with a stored Gemini eval. */
export function grade(aiItems: EvalItem[] = []): { rows: QualityRow[]; score: ReturnType<typeof tally> } {
  const byId = new Map(aiItems.map((i) => [i.id, i]));
  const rows = CASES.map((c) => {
    const r = applyRules({ tag: c.tag, prev_tag: c.prev_tag, title: c.title, body: c.body });
    const rulesPriority = priorityFromRules({ flags: r.flags, bump: r.bump, prerelease: r.prerelease, category: 'dependency' });

    const g = byId.get(c.id) ?? null;
    const aiFlags = g ? [...(g.is_security ? ['SECURITY'] : []), ...(g.is_breaking ? ['BREAKING'] : [])] : [];
    const finalFlags = Array.from(new Set([...r.flags, ...aiFlags])); // AI adds, never removes
    const finalPriority = priorityFromRules({ flags: finalFlags, bump: r.bump, prerelease: r.prerelease, category: 'dependency' });

    const eq = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
    return {
      id: c.id, repo: c.repo, tag: c.tag,
      expected: { flags: c.expect.flags, priority: c.expect.priority },
      rules: { flags: r.flags, priority: rulesPriority, why: r.why },
      ai: g ? { flags: aiFlags, why: g.why, confidence: g.confidence } : null,
      final: { flags: finalFlags, priority: finalPriority },
      rulesOk: eq(r.flags, c.expect.flags) && rulesPriority === c.expect.priority,
      finalOk: eq(finalFlags, c.expect.flags) && finalPriority === c.expect.priority,
    } satisfies QualityRow;
  });
  return { rows, score: tally(rows) };
}

function tally(rows: QualityRow[]) {
  const total = rows.length;
  return {
    total,
    rulesOnly: rows.filter((r) => r.rulesOk).length,
    withAi: rows.filter((r) => r.finalOk).length,
    securityMissed: rows.filter((r) => r.expected.flags.includes('SECURITY') && !r.final.flags.includes('SECURITY')).length,
    aiOnly: rows.filter((r) => !r.rulesOk && r.finalOk).length,
    falseHigh: rows.filter((r) => r.expected.priority !== 'HIGH' && r.final.priority === 'HIGH').length,
  };
}
