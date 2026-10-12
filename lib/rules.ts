// Pure, testable release-classification rules. No network, no AI, no DB.
// Rule flags are decided here FIRST; Gemini may later add flags, never remove them.
import semver from 'semver';

export type Bump = 'MAJOR' | 'MINOR' | 'PATCH' | 'UNKNOWN';
export type Flag = 'SECURITY' | 'BREAKING';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | 'NOT_SURE';
export type Category = 'dependency' | 'evaluating';

/** Keywords that mean "a consumer of this library may be exposed". */
const SECURITY_RE =
  /CVE-\d{4}-\d+|GHSA-|security|vulnerab|\bXSS\b|\bCSRF\b|\bSSRF\b|\bRCE\b|injection|auth(entication)? bypass|privilege escalation|denial of service|\bDoS\b|sanitiz|leak/i;

/**
 * Hard rule 3: a security fix that only touches example code, docs, tests,
 * playgrounds or devDependencies is NOT a risk for consumers of the package.
 * Lines matching this are dropped before the SECURITY regex runs.
 */
const IGNORE_LINE_RE =
  /examples?\/|\bexamples?\b|\bdocs?\b|documentation|\btests?\b|\bspecs?\b|playground|devdependenc|dev-dependenc|chore\(deps-dev\)|chore\(examples?\)/i;

const BREAKING_RE =
  /BREAKING|breaking change|removed support|no longer supported|migration (guide|required)|drop(ped)? support/i;

/**
 * Tag -> semver string. Handles monorepo tags (`@hono/bun@1.0.1`) by taking the
 * part after the last `@`, then stripping any leading non-digits (`v4.2.1`).
 * Deliberately does NOT coerce: `release-2026-10-06` must stay UNKNOWN.
 */
export function parseVersion(tag: string): string | null {
  if (!tag) return null;
  const afterAt = tag.slice(tag.lastIndexOf('@') + 1);
  const stripped = afterAt.trim().replace(/^[^0-9]+/, '');
  return semver.valid(stripped);
}

/**
 * Package prefix of a monorepo tag: `@hono/otel@1.2.0` -> `@hono/otel`.
 * A plain `v4.2.1` has no prefix.
 */
export function tagPrefix(tag: string): string {
  const at = tag.lastIndexOf('@');
  return at > 0 ? tag.slice(0, at) : '';
}

/**
 * The release this one actually succeeds: the HIGHEST version BELOW `tag`,
 * among tags of the same package.
 *
 * Not simply "the release published before this one" — repos maintain several
 * lines at once, so by date a v4 backport follows a v5 release (semver.diff
 * would call that a major bump and flag a fake BREAKING), and a monorepo would
 * compare two unrelated packages.
 */
export function previousTag(tag: string, tags: string[]): string | null {
  const cur = parseVersion(tag);
  const prefix = tagPrefix(tag);
  const sameFamily = tags.filter((t) => t !== tag && tagPrefix(t) === prefix);
  if (!cur) return sameFamily[0] ?? null; // non-semver scheme: fall back to publish order

  const older = sameFamily
    .map((t) => ({ t, v: parseVersion(t) }))
    .filter((x): x is { t: string; v: string } => !!x.v && semver.lt(x.v, cur))
    .sort((a, b) => semver.rcompare(a.v, b.v));
  return older[0]?.t ?? null;
}

export function bumpOf(tag: string, prevTag?: string | null): Bump {
  const cur = parseVersion(tag);
  const prev = prevTag ? parseVersion(prevTag) : null;
  if (!cur || !prev) return 'UNKNOWN';
  const d = semver.diff(prev, cur);
  if (!d) return 'UNKNOWN';
  if (d === 'major' || d === 'premajor') return 'MAJOR';
  if (d === 'minor' || d === 'preminor') return 'MINOR';
  return 'PATCH'; // patch | prepatch | prerelease
}

export function isPrerelease(tag: string, flagged?: boolean): boolean {
  if (flagged) return true;
  const v = parseVersion(tag);
  return !!v && (semver.prerelease(v)?.length ?? 0) > 0;
}

/** Lines that survive the example/docs/test filter. */
export function consumerLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !IGNORE_LINE_RE.test(l));
}

export function matchSecurity(title: string, body: string): string | null {
  for (const line of consumerLines([title, body].filter(Boolean).join('\n'))) {
    const m = line.match(SECURITY_RE);
    if (m) return m[0];
  }
  return null;
}

export function matchBreakingText(title: string, body: string): string | null {
  // Not line-filtered: "Migration guide in docs" is still a breaking change.
  const m = [title, body].filter(Boolean).join('\n').match(BREAKING_RE);
  return m ? m[0] : null;
}

export interface RuleInput {
  tag: string;
  prev_tag?: string | null;
  title?: string;
  body?: string;
  prerelease?: boolean;
}

export interface RuleResult {
  bump: Bump;
  flags: Flag[];
  prerelease: boolean;
  why: string;
}

export function applyRules(input: RuleInput): RuleResult {
  const title = input.title ?? '';
  const body = (input.body ?? '').slice(0, 20000);
  const bump = bumpOf(input.tag, input.prev_tag);
  const prerelease = isPrerelease(input.tag, input.prerelease);

  const flags: Flag[] = [];
  const reasons: string[] = [];

  const sec = matchSecurity(title, body);
  if (sec) {
    flags.push('SECURITY');
    reasons.push(`Matched "${sec}" in release notes`);
  }

  const brkText = matchBreakingText(title, body);
  if (bump === 'MAJOR') {
    flags.push('BREAKING');
    reasons.push(`Major version bump ${input.prev_tag} → ${input.tag}`);
  } else if (brkText) {
    flags.push('BREAKING');
    reasons.push(`Matched "${brkText}" in release notes`);
  }

  if (!reasons.length) {
    if (prerelease) reasons.push('Pre-release, no security or breaking signal');
    else if (bump === 'MINOR') reasons.push('Minor release, new functionality to review');
    else if (bump === 'PATCH') reasons.push('Patch release, no security or breaking signal');
    else if (parseVersion(input.tag)) reasons.push('No earlier release of this package to compare against');
    else reasons.push('Version scheme not semver, no security or breaking signal');
  }

  return { bump, flags, prerelease, why: reasons.join(' · ') };
}

/**
 * Priority from rules alone (section 5). The pipeline re-runs this after
 * merging Gemini's flags, and may raise MINOR/MAJOR to MEDIUM on
 * action = "plan upgrade" or set NOT_SURE on low confidence.
 */
export function priorityFromRules(args: {
  flags: Flag[] | string[];
  bump: Bump;
  prerelease: boolean;
  category: Category;
}): Priority {
  const { flags, bump, prerelease, category } = args;
  if (flags.includes('SECURITY')) return 'HIGH';
  if (flags.includes('BREAKING')) return category === 'dependency' ? 'HIGH' : 'MEDIUM';
  if (prerelease) return 'LOW';
  // ASSUME: an unflagged MINOR/MAJOR is MEDIUM by default; Gemini can drop it to
  // LOW with action = "no action". Fixtures F03/F11 expect MEDIUM from rules alone.
  if (bump === 'MINOR' || bump === 'MAJOR') return 'MEDIUM';
  return 'LOW';
}
