import { Prisma } from "@prisma/client";

/**
 * True when the error indicates the database server is unreachable
 * (server stopped, wrong DATABASE_URL, network blocked).
 *
 * Matches both Prisma's typed init error and the wrapped string form that
 * surfaces via Next's error boundary, since the typed instance does not always
 * survive serialization across the server/client boundary.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Error) {
    return /can't reach database server|connect ECONNREFUSED|database server at/i.test(
      err.message
    );
  }
  return false;
}
