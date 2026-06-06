import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET } = await import("@/app/api/users/route");

describe("API /api/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/users", () => {
    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      const req = createMockRequest("http://localhost:3000/api/users");
      const res = await GET(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      const req = createMockRequest("http://localhost:3000/api/users");
      const res = await GET(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns 403 for EXTERNAL role", async () => {
      mockAuth(fixtures.external);
      const req = createMockRequest("http://localhost:3000/api/users");
      const res = await GET(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("returns paginated users for ADMIN", async () => {
      mockAuth(fixtures.admin);
      const mockUsers = [
        { id: "u1", name: "Alice", email: "alice@test.com", role: "MEMBER", teamMemberships: [] },
        { id: "u2", name: "Bob", email: "bob@test.com", role: "MEMBER", teamMemberships: [] },
      ];
      vi.mocked(prisma.user.findMany).mockResolvedValue(mockUsers as any);
      vi.mocked(prisma.user.count).mockResolvedValue(2);

      const req = createMockRequest("http://localhost:3000/api/users");
      const res = await GET(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(2);
    });

    it("returns paginated users for HR", async () => {
      mockAuth(fixtures.hr);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users");
      const res = await GET(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
    });

    it("scopes query to user's company", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users");
      await GET(req as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: fixtures.admin.companyId,
          }),
        })
      );
    });

    it("applies search filter", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users?search=alice");
      await GET(req as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: { contains: "alice", mode: "insensitive" } }),
              expect.objectContaining({ email: { contains: "alice", mode: "insensitive" } }),
            ]),
          }),
        })
      );
    });

    it("filters out archived users by default", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users");
      await GET(req as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            archivedAt: null,
          }),
        })
      );
    });

    it("includes archived users when ?archived=true", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users?archived=true");
      await GET(req as any);

      const callArgs = vi.mocked(prisma.user.findMany).mock.calls[0][0] as any;
      expect(callArgs.where.archivedAt).toBeUndefined();
    });

    it("filters by role=EXTERNAL param", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users?role=EXTERNAL");
      await GET(req as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: "EXTERNAL",
          }),
        })
      );
    });

    it("filters by role=HR_ADMIN param", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.user.findMany).mockResolvedValue([]);
      vi.mocked(prisma.user.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/users?role=HR_ADMIN");
      await GET(req as any);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: ["HR", "ADMIN"] },
          }),
        })
      );
    });
  });
});
