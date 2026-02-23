import { useEffect, useMemo, useState } from 'react';

function extractRepoFromHref(href: string): string | undefined {
  try {
    const parsed = new URL(href);
    if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com') {
      return undefined;
    }

    const [owner, repo] = parsed.pathname.split('/').filter(Boolean).slice(0, 2);
    if (!owner || !repo) {
      return undefined;
    }

    return `${owner}/${repo}`;
  } catch {
    return undefined;
  }
}

function formatStarCount(stars: number): string {
  return stars.toLocaleString('en-US');
}

interface GitHubPrimaryLinkProps {
  href: string;
  repo?: string;
  className?: string;
  showStars?: boolean;
  onClick?: () => void;
}

export function GitHubPrimaryLink({
  href,
  repo,
  className = '',
  showStars = true,
  onClick,
}: GitHubPrimaryLinkProps) {
  const resolvedRepo = useMemo(() => repo || extractRepoFromHref(href), [href, repo]);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    if (!showStars || !resolvedRepo) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);

    fetch(`https://api.github.com/repos/${resolvedRepo}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/vnd.github+json',
      },
    })
      .then((response) => {
        if (!response.ok) {
          return null;
        }
        return response.json();
      })
      .then((payload) => {
        if (!payload || typeof payload.stargazers_count !== 'number') {
          return;
        }
        setStars(payload.stargazers_count);
      })
      .catch(() => {
        // Ignore network errors and keep the repo link fallback.
      })
      .finally(() => {
        window.clearTimeout(timeout);
      });

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [resolvedRepo, showStars]);

  return (
    <a href={href} className={className} onClick={onClick}>
      <span>{resolvedRepo || 'GitHub'}</span>
      {showStars && typeof stars === 'number' && (
        <span className="inline-flex items-center gap-1 text-gray-500">
          <span>☆</span>
          <span>{formatStarCount(stars)}</span>
        </span>
      )}
    </a>
  );
}
