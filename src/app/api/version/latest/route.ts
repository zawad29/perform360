import { NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

const GITHUB_RELEASES_URL =
  "https://api.github.com/repos/tamzid958/perform360/releases/latest";

// In-process cache so a busy admin page doesn't hammer the GitHub API.
// 1h is short enough to surface a release within a day, long enough that
// public rate limits don't bite (60/h unauthenticated per IP).
const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { fetchedAt: number; data: VersionPayload } | null = null;

interface VersionPayload {
  current: string;
  latest: string | null;
  isOutdated: boolean;
  releaseUrl: string | null;
  publishedAt: string | null;
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
  const pb = b.replace(/^v/, "").split(".").map((n) => parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export async function GET() {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult;

  const current = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return NextResponse.json({ success: true, data: cache.data });
  }

  try {
    const res = await fetch(GITHUB_RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json" },
      // Network call from the server — the response is cached above so this
      // only runs once per CACHE_TTL_MS regardless of how many admins poll.
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      const fallback: VersionPayload = {
        current,
        latest: null,
        isOutdated: false,
        releaseUrl: null,
        publishedAt: null,
      };
      return NextResponse.json({ success: true, data: fallback });
    }

    const json = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      published_at?: string;
    };
    const latest = json.tag_name ?? null;
    const data: VersionPayload = {
      current,
      latest,
      isOutdated:
        latest !== null && current !== "dev"
          ? compareSemver(latest, current) > 0
          : false,
      releaseUrl: json.html_url ?? null,
      publishedAt: json.published_at ?? null,
    };

    cache = { fetchedAt: now, data };
    return NextResponse.json({ success: true, data });
  } catch (err) {
    console.error("Version check failed:", err);
    const fallback: VersionPayload = {
      current,
      latest: null,
      isOutdated: false,
      releaseUrl: null,
      publishedAt: null,
    };
    return NextResponse.json({ success: true, data: fallback });
  }
}
