/**
 * Client-side request helpers for user mutations shared between the people
 * list and person-detail pages. Each returns a normalized result so callers
 * keep their own toast / navigation / refetch wiring.
 */

interface MutationResult {
  ok: boolean;
  error?: string;
}

async function parseResult(res: Response, fallback: string): Promise<MutationResult> {
  try {
    const json = await res.json();
    if (!json.success) return { ok: false, error: json.error || fallback };
    return { ok: true };
  } catch {
    return { ok: false, error: fallback };
  }
}

export async function deactivateUser(userId: string): Promise<MutationResult> {
  const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
  return parseResult(res, "Failed to deactivate user");
}

export async function restoreUser(userId: string): Promise<MutationResult> {
  const res = await fetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: false }),
  });
  return parseResult(res, "Failed to restore user");
}
