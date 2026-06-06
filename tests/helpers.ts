import { vi } from "vitest";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Create a mock NextRequest-like object for API route testing.
 */
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = "GET", body, headers = {} } = options;
  return new Request(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * Parse a NextResponse JSON body.
 */
export async function parseResponse(response: Response) {
  return {
    status: response.status,
    body: await response.json(),
  };
}

/**
 * Set up auth mock to return a specific user.
 */
export function mockAuth(user: {
  userId: string;
  email: string;
  role: "ADMIN" | "HR" | "MEMBER" | "EXTERNAL";
  companyId: string;
}) {
  vi.mocked(auth).mockResolvedValue({
    user: {
      email: user.email,
      companyId: user.companyId,
    },
    expires: new Date(Date.now() + 86400000).toISOString(),
  } as any);

  vi.mocked(prisma.user.findFirst).mockResolvedValue({
    id: user.userId,
    email: user.email,
    role: user.role,
    companyId: user.companyId,
  } as any);
}

/**
 * Set up auth mock to return no session (unauthenticated).
 */
export function mockNoAuth() {
  vi.mocked(auth).mockResolvedValue(null as any);
}

/** Default test user fixtures */
export const fixtures = {
  admin: {
    userId: "cuser-admin-1",
    email: "admin@test.com",
    role: "ADMIN" as const,
    companyId: "ccompany-1",
  },
  hr: {
    userId: "cuser-hr-1",
    email: "hr@test.com",
    role: "HR" as const,
    companyId: "ccompany-1",
  },
  employee: {
    userId: "cuser-employee-1",
    email: "employee@test.com",
    role: "MEMBER" as const,
    companyId: "ccompany-1",
  },
  external: {
    userId: "cuser-external-1",
    email: "external@test.com",
    role: "EXTERNAL" as const,
    companyId: "ccompany-1",
  },
};
