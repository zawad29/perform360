import { prisma } from "@/lib/prisma";

const ARCHIVED_EMAIL_PREFIX = "__archived__";

export function getArchivedEmail(email: string, userId: string): string {
  return `${ARCHIVED_EMAIL_PREFIX}${userId}__${email}`;
}

export function getDisplayEmail(email: string | null | undefined): string {
  if (!email) return "";
  if (!email.startsWith(ARCHIVED_EMAIL_PREFIX)) return email;

  const parts = email.split("__");
  return parts.length >= 4 ? parts.slice(3).join("__") : email;
}

export function isArchivedEmail(email: string): boolean {
  return email.startsWith(ARCHIVED_EMAIL_PREFIX);
}

/**
 * Finds an active (non-archived) user in the company with the given email.
 * Pass `excludeId` to ignore a specific user (e.g. the one being updated).
 * Returns the user id if a conflict exists, otherwise null.
 */
export async function findActiveUserByEmail(
  companyId: string,
  email: string,
  excludeId?: string
): Promise<{ id: string } | null> {
  return prisma.user.findFirst({
    where: {
      companyId,
      archivedAt: null,
      email,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
}
