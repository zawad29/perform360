import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseResponse } from "../helpers";

const { GET: listAssignments } = await import(
  "@/app/api/review/[token]/assignments/route"
);

const SUMMARY_TOKEN = "summary-tok-xyz";

function makeRequest(
  url: string,
  cookies: Record<string, string> = {}
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": "127.0.0.1",
  };
  if (Object.keys(cookies).length > 0) {
    headers.cookie = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return new NextRequest(url, {
    method: "GET",
    headers,
  });
}

describe("Review: Assignments list (GET /api/review/[token]/assignments)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 without session cookie", async () => {
    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/assignments`
    );
    const res = await listAssignments(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(401);
    expect(body.code).toBe("NO_SESSION");
  });

  it("returns 401 for expired session", async () => {
    const sessionToken = "expired-session";
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken,
      sessionExpiry: new Date(Date.now() - 60_000), // expired
      reviewerLink: null,
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/assignments`,
      { evaluation_session: sessionToken }
    );
    const res = await listAssignments(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(401);
    expect(body.code).toBe("SESSION_EXPIRED");
  });

  it("returns 403 for session-token mismatch", async () => {
    const sessionToken = "valid-session";
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken,
      sessionExpiry: new Date(Date.now() + 3600_000),
      reviewerLink: {
        token: "different-summary-token", // mismatch
        cycleId: "c1",
        reviewerId: "r1",
        cycle: { name: "Q1", status: "ACTIVE", id: "c1", endDate: new Date(Date.now() + 86400000) },
      },
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/assignments`,
      { evaluation_session: sessionToken }
    );
    const res = await listAssignments(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(403);
    expect(body.code).toBe("SESSION_MISMATCH");
  });

  it("returns assignments list for valid session", async () => {
    const sessionToken = "valid-session";
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken,
      sessionExpiry: new Date(Date.now() + 3600_000),
      reviewerLink: {
        token: SUMMARY_TOKEN,
        cycleId: "c1",
        reviewerId: "r1",
        cycle: {
          name: "Q1 2026",
          status: "ACTIVE",
          id: "c1",
          endDate: new Date("2026-04-01"),
        },
      },
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      { id: "a1", token: "tok1", subjectId: "s1", direction: "LATERAL", status: "PENDING" },
      { id: "a2", token: "tok2", subjectId: "s2", direction: "DOWNWARD", status: "SUBMITTED" },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "s1", name: "Alice" },
      { id: "s2", name: "Bob" },
    ] as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/assignments`,
      { evaluation_session: sessionToken }
    );
    const res = await listAssignments(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.cycleName).toBe("Q1 2026");
    expect(body.data.assignments).toHaveLength(2);
    expect(body.data.assignments[0]).toEqual(
      expect.objectContaining({
        token: "tok1",
        subjectName: "Alice",
        status: "PENDING",
      })
    );
    expect(body.data.assignments[1]).toEqual(
      expect.objectContaining({
        token: "tok2",
        subjectName: "Bob",
        status: "SUBMITTED",
      })
    );
  });

  it("returns 410 for inactive cycle", async () => {
    const sessionToken = "valid-session";
    vi.mocked(prisma.otpSession.findUnique).mockResolvedValue({
      sessionToken,
      sessionExpiry: new Date(Date.now() + 3600_000),
      reviewerLink: {
        token: SUMMARY_TOKEN,
        cycleId: "c1",
        reviewerId: "r1",
        cycle: {
          name: "Q1 2026",
          status: "CLOSED",
          id: "c1",
          endDate: new Date("2026-04-01"),
        },
      },
    } as any);

    const req = makeRequest(
      `http://localhost:3000/api/review/${SUMMARY_TOKEN}/assignments`,
      { evaluation_session: sessionToken }
    );
    const res = await listAssignments(req, { params: Promise.resolve({ token: SUMMARY_TOKEN }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(410);
    expect(body.code).toBe("CYCLE_INACTIVE");
  });
});
