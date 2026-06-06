import { NextResponse } from "next/server";
import { auth } from "./auth";
import { prisma } from "./prisma";

type UserRole = "ADMIN" | "HR" | "MEMBER" | "EXTERNAL";

interface AuthResult {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
}

/**
 * Require authenticated session and return user info.
 * Returns NextResponse error if unauthenticated.
 */
export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: session.user.email, archivedAt: null },
    select: { id: true, email: true, role: true, companyId: true },
  });

  if (!user) {
    return NextResponse.json(
      { success: false, error: "User not found" },
      { status: 401 }
    );
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  };
}

/**
 * Require specific roles. Returns NextResponse error if role doesn't match.
 */
export async function requireRole(
  ...allowedRoles: UserRole[]
): Promise<AuthResult | NextResponse> {
  const result = await requireAuth();

  if (result instanceof NextResponse) return result;

  if (!allowedRoles.includes(result.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  }

  return result;
}

/**
 * Require ADMIN or HR role.
 */
export async function requireAdminOrHR(): Promise<AuthResult | NextResponse> {
  return requireRole("ADMIN", "HR");
}

/**
 * Type guard to check if auth result is an error response.
 */
export function isAuthError(
  result: AuthResult | NextResponse
): result is NextResponse {
  return result instanceof NextResponse;
}
