import { REPO } from './site';

/**
 * Star + fork counts for the repo. Cached for an hour so the landing page
 * never rate-limits, and never blocks a render on GitHub being slow.
 */
export async function getRepoStats() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = await res.json();
    return {
      stars: data.stargazers_count ?? null,
      forks: data.forks_count ?? null,
      issues: data.open_issues_count ?? null,
      pushedAt: data.pushed_at ?? null,
    };
  } catch {
    return null;
  }
}

export function formatCount(n) {
  if (n === null || n === undefined) return null;
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k`;
}
