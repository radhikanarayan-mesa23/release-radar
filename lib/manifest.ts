/**
 * "Does this release actually affect my codebase?"
 *
 * A digest that says axios has a CVE still leaves you opening package.json to
 * find out whether you are even on a vulnerable version. This maps each tracked
 * repo to the package it ships, compares the release against the range in
 * Keerthi's manifest, and says: affects you, already covered, or not installed.
 *
 * Ranges only — never a lockfile and never source.
 */
import semver from 'semver';
import { parseVersion, tagPrefix } from './rules';

export interface Dep { name: string; range: string; dev: boolean }

/** Parse a pasted package.json. Throws a readable error, never a raw JSON one. */
export function parseManifest(text: string): Dep[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That is not valid JSON — paste the whole package.json file.');
  }
  const o = json as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  if (!o || typeof o !== 'object' || (!o.dependencies && !o.devDependencies)) {
    throw new Error('No "dependencies" or "devDependencies" found in that JSON.');
  }
  const out: Dep[] = [];
  for (const [name, range] of Object.entries(o.dependencies ?? {})) {
    if (typeof range === 'string') out.push({ name, range, dev: false });
  }
  for (const [name, range] of Object.entries(o.devDependencies ?? {})) {
    if (typeof range === 'string' && !out.some((d) => d.name === name)) {
      out.push({ name, range, dev: true });
    }
  }
  return out;
}

/**
 * Candidate npm names for a repo, best guess first. A monorepo tag names its own
 * package, so it wins outright.
 */
export function candidateNames(owner: string, name: string, tag: string, explicit?: string | null): string[] {
  const fromTag = tagPrefix(tag); // "@hono/otel@1.2.0" -> "@hono/otel"
  const c = [
    explicit || '',
    fromTag,
    name,
    name.replace(/[-_](node|js|sdk|nodejs|client)$/i, ''),   // stripe-node -> stripe
    `@${owner.toLowerCase()}/${name}`,
    owner.toLowerCase(),
  ];
  return [...new Set(c.filter(Boolean))];
}

export type MatchKind = 'affects' | 'covered' | 'absent' | 'unknown';

export interface Match {
  kind: MatchKind;
  package?: string;
  range?: string;
  installed?: string;   // lowest version the range allows
  behind?: string;      // major | minor | patch
  dev?: boolean;
}

/**
 * Compare one release against the manifest.
 *  affects  — the release is newer than the range allows
 *  covered  — the range already permits this version or newer
 *  absent   — the package is not in the manifest at all
 *  unknown  — no manifest, or the tag is not semver
 */
export function matchRelease(
  args: { owner: string; name: string; tag: string; package_name?: string | null },
  deps: Map<string, Dep>,
): Match {
  if (!deps.size) return { kind: 'unknown' };

  const names = candidateNames(args.owner, args.name, args.tag, args.package_name);
  const hit = names.map((n) => deps.get(n)).find(Boolean);
  if (!hit) return { kind: 'absent' };

  const released = parseVersion(args.tag);
  if (!released) return { kind: 'unknown', package: hit.name, range: hit.range, dev: hit.dev };

  let installed: semver.SemVer | null = null;
  try { installed = semver.minVersion(hit.range); } catch { installed = null; }
  if (!installed) {
    return { kind: 'unknown', package: hit.name, range: hit.range, dev: hit.dev };
  }

  if (semver.gt(released, installed.version)) {
    return {
      kind: 'affects', package: hit.name, range: hit.range,
      installed: installed.version,
      behind: semver.diff(installed.version, released) ?? undefined,
      dev: hit.dev,
    };
  }
  return {
    kind: 'covered', package: hit.name, range: hit.range,
    installed: installed.version, dev: hit.dev,
  };
}

export const MATCH_LABEL: Record<MatchKind, string> = {
  affects: 'affects you',
  covered: 'already covered',
  absent: 'not installed',
  unknown: 'unknown',
};
