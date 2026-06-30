/**
 * True when the error indicates the database server is unreachable
 * (server stopped, wrong DATABASE_URL, network blocked).
 *
 * Uses string matching instead of instanceof because this function is called
 * from the client-side error boundary, where Prisma classes are not available.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    return /can't reach database server|connect ECONNREFUSED|database server at/i.test(
      err.message
    );
  }
  return false;
}
