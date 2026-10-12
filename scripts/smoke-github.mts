// Live check of lib/github.ts + lib/rules.ts against real repos. No DB, no AI.
// Works without GITHUB_TOKEN (60 req/hr unauthenticated).  `npm run smoke`
import { applyRules, parseVersion, previousTag, priorityFromRules } from '../lib/rules';
import { listReleases, listTags, parseRepoRef, splitRepoInput, type GhRelease } from '../lib/github';

let fails = 0;
const ok = (cond: boolean, label: string, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`);
};

console.log('=== 1. Repo reference parsing (what the bulk-add box must swallow) ===');
const INPUT = `https://github.com/stripe/stripe-node
  honojs/hono, https://github.com/plaid/plaid-node.git
https://github.com/fastify/fastify/releases  not a repo!!`;
const refs = splitRepoInput(INPUT);
console.log(`split into ${refs.length} tokens`);
for (const raw of refs) {
  const r = parseRepoRef(raw);
  console.log(`  ${r ? `${r.owner}/${r.name}`.padEnd(24) : '(rejected)'.padEnd(24)} <- ${raw}`);
}
ok(parseRepoRef('https://github.com/stripe/stripe-node')?.name === 'stripe-node', 'full URL');
ok(parseRepoRef('honojs/hono')?.owner === 'honojs', 'owner/name');
ok(parseRepoRef('https://github.com/plaid/plaid-node.git')?.name === 'plaid-node', '.git suffix stripped');
ok(parseRepoRef('not a repo!!') === null, 'garbage rejected');

console.log('\n=== 2. Version parsing, incl. monorepo tags ===');
const VERSIONS: [string, string | null][] = [
  ['v4.2.1', '4.2.1'],
  ['@hono/bun@1.0.1', '1.0.1'],
  ['@aws-sdk/client-s3@3.700.0', '3.700.0'],
  ['release-2026-10-06', null],
  ['2.14.0', '2.14.0'],
  ['v2.3.0-beta.1', '2.3.0-beta.1'],
];
for (const [tag, want] of VERSIONS) {
  const got = parseVersion(tag);
  ok(got === want, `${tag.padEnd(26)} -> ${String(got)}`, want === got ? '' : `(expected ${want})`);
}

console.log('\n=== 3. Live GitHub releases + rules on real notes ===');
const REPOS: [string, string, 'dependency' | 'evaluating'][] = [
  ['stripe', 'stripe-node', 'dependency'],
  ['axios', 'axios', 'dependency'],
  ['expressjs', 'express', 'dependency'],
  ['honojs', 'middleware', 'evaluating'],   // monorepo tags: @hono/<pkg>@x.y.z
  ['fastify', 'fastify', 'evaluating'],
];

for (const [owner, name, category] of REPOS) {
  try {
    const all = (await listReleases(owner, name))
      .filter((r) => !r.draft)
      .sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''));
    console.log(`\n${owner}/${name}  (${all.length} releases fetched, category=${category})`);
    if (!all.length) { console.log('  no releases -> tags fallback would run'); continue; }

    const tagNames = all.map((r) => r.tag_name);
    const prevOf = (r: GhRelease) => previousTag(r.tag_name, tagNames);
    for (const r of all.slice(0, 4)) {
      const res = applyRules({
        tag: r.tag_name, prev_tag: prevOf(r), title: r.name ?? r.tag_name,
        body: r.body ?? '', prerelease: r.prerelease,
      });
      const priority = priorityFromRules({ ...res, category });
      console.log(
        `  ${r.tag_name.padEnd(28)} ${(r.published_at ?? '').slice(0, 10)}` +
        `  prev ${String(prevOf(r)).padEnd(24)}` +
        `  bump ${res.bump.padEnd(7)} [${res.flags.join(',') || '—'}]`.padEnd(28) +
        `  ${priority.padEnd(9)} ${res.why.slice(0, 68)}`,
      );
    }
    ok(all.every((r) => !!r.tag_name), `${owner}/${name}: every release has a tag`);
  } catch (e) {
    console.log(`  ERROR ${e instanceof Error ? e.message : String(e)}`);
    fails++;
  }
}

console.log('\n=== 4. Tags fallback on a repo that publishes no GitHub Releases ===');
try {
  const tags = await listTags('openssl', 'openssl');
  console.log(`  openssl/openssl -> ${tags.length} tags, newest ${tags[0]?.name}`);
  ok(tags.length > 0, 'tags endpoint returns data for the no-releases path');
} catch (e) {
  console.log(`  ERROR ${e instanceof Error ? e.message : String(e)}`);
  fails++;
}

console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`}`);
process.exit(fails ? 1 : 0);
