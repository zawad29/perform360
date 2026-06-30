import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET } = await import("@/app/api/cycles/[id]/assignments/route");
const cycleId = "clxcycle1abc2def3ghi4jkl5m";

describe("GET /api/cycles/[id]/assignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth(fixtures.admin);
  });

  it("groups assignments by team and reviewer", async () => {
    vi.mocked(prisma.evaluationCycle.findFirst).mockResolvedValue({
      id: cycleId,
      cycleTeams: [
        {
          teamId: "team-1",
          team: { id: "team-1", name: "Engineering" },
          templates: [{ template: { id: "tpl-1" } }],
        },
      ],
    } as any);

    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      {
        id: "a1",
        token: "tok-1",
        templateId: "tpl-1",
        subjectId: "s1",
        reviewerId: "r1",
        direction: "LATERAL",
        status: "PENDING",
      },
      {
        id: "a2",
        token: "tok-2",
        templateId: "tpl-1",
        subjectId: "s2",
        reviewerId: "r1",
        direction: "DOWNWARD",
        status: "IN_PROGRESS",
      },
      {
        id: "a3",
        token: "tok-3",
        templateId: "tpl-1",
        subjectId: "s3",
        reviewerId: "r2",
        direction: "SELF",
        status: "SUBMITTED",
      },
    ] as any);

    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "s1", name: "Alice" },
      { id: "s2", name: "Bob" },
      { id: "s3", name: "Cara" },
      { id: "r1", name: "Reviewer One" },
      { id: "r2", name: "Reviewer Two" },
    ] as any);

    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { userId: "r1", teamId: "team-1", role: "MEMBER" },
      { userId: "r2", teamId: "team-1", role: "IMPERSONATOR" },
      { userId: "s1", teamId: "team-1", role: "MEMBER" },
      { userId: "s2", teamId: "team-1", role: "MEMBER" },
      { userId: "s3", teamId: "team-1", role: "MANAGER" },
    ] as any);

    vi.mocked(prisma.cycleReviewerLink.findMany).mockResolvedValue([
      { reviewerId: "r1", token: "reviewer-link-tok-1", id: "crl-1", cycleId: "", createdAt: new Date() },
      { reviewerId: "r2", token: "reviewer-link-tok-2", id: "crl-2", cycleId: "", createdAt: new Date() },
    ] as any);

    const req = createMockRequest(`http://localhost:3000/api/cycles/${cycleId}/assignments`);
    const res = await GET(req as any, { params: Promise.resolve({ id: cycleId }) });
    const { status, body } = await parseResponse(res);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      teamId: "team-1",
      teamName: "Engineering",
    });
    expect(body.data[0].reviewers).toHaveLength(2);
    expect(body.data[0].reviewers[0]).toMatchObject({
      reviewerId: "r1",
      reviewerName: "Reviewer One",
      isImpersonator: false,
      reviewerLinkToken: "reviewer-link-tok-1",
    });
    expect(body.data[0].reviewers[0].assignments).toHaveLength(2);
    expect(body.data[0].reviewers[1]).toMatchObject({
      reviewerId: "r2",
      reviewerName: "Reviewer Two",
      isImpersonator: true,
      reviewerLinkToken: "reviewer-link-tok-2",
    });
    expect(body.data[0].reviewers[1].assignments).toHaveLength(1);
  });
});
