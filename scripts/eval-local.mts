// ONE live Gemini call over seed/fixtures.json, graded offline. No DB. `npm run eval:local`
import { classify, costInr } from '../lib/gemini';
import { CASES, grade } from '../lib/quality';
import { applyRules } from '../lib/rules';

if (!process.env.GEMINI_API_KEY) { console.error('GEMINI_API_KEY not set'); process.exit(1); }
console.log(`model: ${process.env.GEMINI_MODEL || 'gemini-3.8-flash'} · ${CASES.length} fixtures · 1 call\n`);

const ai = await classify(CASES.map((c) => ({
  id: c.id, repo: c.repo, category: 'dependency', tag: c.tag, title: c.title, body: c.body,
  rule_flags: applyRules({ tag: c.tag, prev_tag: c.prev_tag, title: c.title, body: c.body }).flags,
})));

if (!ai.ok) {
  console.error(`Gemini FAILED: ${ai.error}`);
  console.error('(the app still ships the digest on rule flags alone — that is the fail-safe)');
  process.exit(1);
}

const { rows, score } = grade(ai.data.items);
for (const r of rows) {
  const mark = r.finalOk ? (r.rulesOk ? 'pass' : 'AI SAVED IT') : 'MISS';
  console.log(
    `${r.id}  ${r.repo.padEnd(22)} exp ${r.expected.priority.padEnd(9)}` +
    ` rules ${r.rules.priority.padEnd(9)} final ${r.final.priority.padEnd(9)} ${mark}`);
  if (r.ai) console.log(`      gemini: [${r.ai.flags.join(',') || '—'}] conf ${r.ai.confidence} · ${r.ai.why}`);
}

console.log(`\nrules only            ${score.rulesOnly}/${score.total}`);
console.log(`rules + Gemini        ${score.withAi}/${score.total}`);
console.log(`security fixes missed ${score.securityMissed}   (must be 0)`);
console.log(`caught by Gemini only ${score.aiOnly}`);
console.log(`false HIGHs           ${score.falseHigh}   (F13 example-only must not be HIGH)`);
console.log(`\ntokens ${ai.input_tokens} in / ${ai.output_tokens} out · ₹${costInr(ai.input_tokens, ai.output_tokens)}`);
console.log(`\nbriefing Gemini wrote:`);
for (const b of ai.data.briefing) console.log(`  [${b.priority}] ${b.text}`);
