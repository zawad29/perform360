import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";

type UserRole = "ADMIN" | "HR" | "MEMBER" | "EXTERNAL";

interface RBACAuth {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
}

type RouteHandler<TParams = Record<string, string>> = (
  request: NextRequest,
  context: { params: TParams; auth: RBACAuth }
) => Promise<NextResponse>;

/**
 * Wraps a route handler to enforce role-based access control.
 * Rejects requests from users whose role is not in requiredRoles.
 */
export function withRBAC<TParams extends Record<string, string>>(
  handler: RouteHandler<TParams>,
  options: { requiredRoles: UserRole[] }
): (request: NextRequest, context: { params: Promise<TParams> }) => Promise<NextResponse> {
  return async (request: NextRequest, context: { params: Promise<TParams> }) => {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    if (!options.requiredRoles.includes(authResult.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const params = await context.params;
    return handler(request, {
      params,
      auth: authResult,
    });
  };
}

/**
 * Convenience: require ADMIN or HR role.
 */
export function withAdminOrHR<TParams extends Record<string, string>>(
  handler: RouteHandler<TParams>
): (request: NextRequest, context: { params: Promise<TParams> }) => Promise<NextResponse> {
  return withRBAC(handler, { requiredRoles: ["ADMIN", "HR"] });
}

/**
 * Convenience: require ADMIN only.
 */
export function withAdmin<TParams extends Record<string, string>>(
  handler: RouteHandler<TParams>
): (request: NextRequest, context: { params: Promise<TParams> }) => Promise<NextResponse> {
  return withRBAC(handler, { requiredRoles: ["ADMIN"] });
}
