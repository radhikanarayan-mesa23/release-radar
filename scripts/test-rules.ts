// Runs lib/rules.ts against seed/fixtures.json. No network, no AI. `npm run test:rules`
import { readFileSync } from 'node:fs';
import { applyRules, priorityFromRules, type Category } from '../lib/rules';

interface Fixture {
  id: string; repo: string; tag: string; prev_tag: string; title: string; body: string;
  expect: { bump: string; flags: string[]; priority: string; prerelease?: boolean; _why?: string };
}

const { cases } = JSON.parse(
  readFileSync(new URL('../seed/fixtures.json', import.meta.url), 'utf8'),
) as { cases: Fixture[] };

// Fixtures carry no category; treat every synthetic repo as a dependency.
const CATEGORY: Category = 'dependency';

let bumpOk = 0, flagsOk = 0, prioOk = 0, allOk = 0;
const rows: string[] = [];

for (const c of cases) {
  const r = applyRules({ tag: c.tag, prev_tag: c.prev_tag, title: c.title, body: c.body });
  const priority = priorityFromRules({ flags: r.flags, bump: r.bump, prerelease: r.prerelease, category: CATEGORY });

  const expFlags = [...c.expect.flags].sort().join(',');
  const gotFlags = [...r.flags].sort().join(',');
  const okBump = r.bump === c.expect.bump;
  const okFlags = gotFlags === expFlags;
  const okPrio = priority === c.expect.priority;
  const ok = okBump && okFlags && okPrio;

  if (okBump) bumpOk++;
  if (okFlags) flagsOk++;
  if (okPrio) prioOk++;
  if (ok) allOk++;

  rows.push(
    `${ok ? 'PASS' : 'FAIL'}  ${c.id}  ${c.repo.padEnd(22)} ${c.tag.padEnd(18)}` +
      ` bump ${r.bump.padEnd(7)}${okBump ? ' ' : `(exp ${c.expect.bump}) `}` +
      ` flags [${gotFlags}]${okFlags ? '' : ` (exp [${expFlags}])`}` +
      ` prio ${priority}${okPrio ? '' : ` (exp ${c.expect.priority})`}`,
  );
}

console.log(rows.join('\n'));
console.log('\n--- rules only ---');
console.log(`bump      ${bumpOk}/${cases.length}`);
console.log(`flags     ${flagsOk}/${cases.length}`);
console.log(`priority  ${prioOk}/${cases.length}`);
console.log(`overall   ${allOk}/${cases.length}`);

const f10 = cases.find((c) => c.id === 'F10')!;
const f13 = cases.find((c) => c.id === 'F13')!;
const r13 = applyRules({ tag: f13.tag, prev_tag: f13.prev_tag, title: f13.title, body: f13.body });
const p13 = priorityFromRules({ flags: r13.flags, bump: r13.bump, prerelease: r13.prerelease, category: CATEGORY });

console.log(`\nF10 is the deliberate AI-only case (rules cannot see "${f10.body.slice(0, 40)}...")`);
console.log(`F13 example-only security -> priority ${p13} ${p13 === 'HIGH' ? 'ERROR: must not be HIGH' : '(correct: not HIGH)'}`);

const expectedOverall = cases.length - 1; // F10
const pass = allOk === expectedOverall && p13 !== 'HIGH';
console.log(`\n${pass ? 'OK' : 'UNEXPECTED'}: ${allOk}/${cases.length} rules-only (F10 is the AI-only case)`);
process.exit(pass ? 0 : 1);
