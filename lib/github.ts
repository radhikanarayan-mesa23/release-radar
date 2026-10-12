// Public GitHub REST API only. No scraping, no OAuth, no GitHub App.
const API = 'https://api.github.com';

export interface GhRelease {
  tag_name: string; name: string | null; body: string | null; html_url: string;
  published_at: string | null; draft: boolean; prerelease: boolean;
}
export interface GhTag { name: string; commit: { sha: string; url: string }; }
export interface GhRepo {
  full_name: string; owner: { login: string; avatar_url: string };
  name: string; stargazers_count: number; html_url: string;
}
export interface GhAdvisory {
  ghsa_id: string; summary: string; description: string | null;
  severity: string | null; published_at: string | null; html_url: string;
}

export class GhError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function gh<T>(path: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch(`${API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'release-radar',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new GhError(`${res.status} ${res.statusText} on ${path}`, res.status);
  }
  return (await res.json()) as T;
}

/** `https://github.com/owner/name`, `owner/name`, `owner/name.git` -> {owner,name} */
export function parseRepoRef(raw: string): { owner: string; name: string } | null {
  const s = raw.trim().replace(/^<|>$/g, '');
  if (!s) return null;
  const m = s.match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?(?:[#?].*)?$/i);
  if (!m) return null;
  return { owner: m[1], name: m[2] };
}

/** Split a textarea of links / owner-name values on spaces, commas or newlines. */
export function splitRepoInput(text: string): string[] {
  return text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export const getRepo = (o: string, r: string) => gh<GhRepo>(`/repos/${o}/${r}`);

export const listReleases = (o: string, r: string) =>
  gh<GhRelease[]>(`/repos/${o}/${r}/releases?per_page=15`);

export const listTags = (o: string, r: string) =>
  gh<GhTag[]>(`/repos/${o}/${r}/tags?per_page=3`);

export const getCommitDate = async (o: string, r: string, sha: string) => {
  const c = await gh<{ commit: { committer: { date: string } } }>(`/repos/${o}/${r}/commits/${sha}`);
  return c.commit.committer.date;
};

/** Advisories are often 403/404 on repos without the feature: skip silently. */
export async function listAdvisories(o: string, r: string): Promise<GhAdvisory[]> {
  try {
    return await gh<GhAdvisory[]>(`/repos/${o}/${r}/security-advisories?state=published&per_page=5`);
  } catch (e) {
    if (e instanceof GhError && (e.status === 403 || e.status === 404)) return [];
    throw e;
  }
}

export function avatarUrl(owner: string): string {
  return `https://github.com/${owner}.png?size=80`;
}

/** Run tasks with a fixed concurrency (default 5, per the brief). */
export async function pool<T, R>(
  items: T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
