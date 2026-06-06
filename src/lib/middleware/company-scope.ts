import { NextRequest, NextResponse } from "next/server";
import { requireAuth, isAuthError } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type UserRole = "ADMIN" | "HR" | "MEMBER" | "EXTERNAL";

interface CompanyScopedAuth {
  userId: string;
  email: string;
  role: UserRole;
  companyId: string;
}

type RouteHandler<TParams = Record<string, string>> = (
  request: NextRequest,
  context: { params: TParams; auth: CompanyScopedAuth }
) => Promise<NextResponse>;

/**
 * Wraps a route handler to enforce company-scoped authentication.
 * Verifies the authenticated user belongs to the company that owns
 * the requested resource (when a resourceId is provided).
 */
export function withCompanyScope<TParams extends Record<string, string>>(
  handler: RouteHandler<TParams>,
  options?: {
    /** Model name to check ownership against (e.g., "evaluationCycle", "team") */
    resourceModel?: "evaluationCycle" | "team" | "evaluationTemplate";
    /** Param key for the resource ID (defaults to "id") */
    resourceParamKey?: string;
  }
): (request: NextRequest, context: { params: Promise<TParams> }) => Promise<NextResponse> {
  return async (request: NextRequest, context: { params: Promise<TParams> }) => {
    const authResult = await requireAuth();
    if (isAuthError(authResult)) return authResult;

    const params = await context.params;

    // If a resource model is specified, verify it belongs to the user's company
    if (options?.resourceModel) {
      const paramKey = options.resourceParamKey ?? "id";
      const resourceId = params[paramKey];

      if (resourceId) {
        const exists = await verifyResourceOwnership(
          options.resourceModel,
          resourceId,
          authResult.companyId
        );

        if (!exists) {
          return NextResponse.json(
            { success: false, error: "Resource not found", code: "NOT_FOUND" },
            { status: 404 }
          );
        }
      }
    }

    return handler(request, {
      params,
      auth: authResult,
    });
  };
}

async function verifyResourceOwnership(
  model: "evaluationCycle" | "team" | "evaluationTemplate",
  resourceId: string,
  companyId: string
): Promise<boolean> {
  switch (model) {
    case "evaluationCycle": {
      const cycle = await prisma.evaluationCycle.findFirst({
        where: { id: resourceId, companyId },
        select: { id: true },
      });
      return cycle !== null;
    }
    case "team": {
      const team = await prisma.team.findFirst({
        where: { id: resourceId, companyId },
        select: { id: true },
      });
      return team !== null;
    }
    case "evaluationTemplate": {
      const template = await prisma.evaluationTemplate.findFirst({
        where: { id: resourceId, companyId },
        select: { id: true },
      });
      return template !== null;
    }
  }
}
