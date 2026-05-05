"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";

interface VersionPayload {
  current: string;
  latest: string | null;
  isOutdated: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
}

/**
 * Surfaces an "update available" banner when the running build is older than
 * the latest published GitHub release. Auto-updating Watchtower handles the
 * actual swap — this is purely informational so admins know one is queued.
 *
 * Renders nothing while loading, on error, or when up-to-date — caller can
 * place this anywhere without worrying about reserved space.
 */
export function UpdateBanner() {
  const [version, setVersion] = useState<VersionPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/version/latest")
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.success) setVersion(json.data);
      })
      .catch(() => {
        // Silent failure — no banner is the right default when we can't tell.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version || !version.isOutdated || !version.latest) return null;

  return (
    <div className="border border-accent bg-accent/[0.04] px-4 py-3 mb-6 flex items-start gap-3">
      <RefreshCw size={16} strokeWidth={1.5} className="text-accent mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-900">
          Update available — version {version.latest}
        </p>
        <p className="text-[12px] text-gray-500 mt-0.5">
          You&apos;re running {version.current}. Auto-updates run within 24 hours;
          for an immediate update, restart the containers on your host.
        </p>
      </div>
      {version.releaseUrl && (
        <a
          href={version.releaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] font-medium text-accent hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Release notes
          <ArrowUpRight size={12} strokeWidth={2} />
        </a>
      )}
    </div>
  );
}
