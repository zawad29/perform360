import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  requireAuth,
  requireRole,
  requireAdminOrHR,
  isAuthError,
} from "@/lib/api-auth";

describe("api-auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("requireAuth", () => {
    it("returns 401 when no session", async () => {
      vi.mocked(auth).mockResolvedValue(null as any);
      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("returns 401 when session has no email", async () => {
      vi.mocked(auth).mockResolvedValue({ user: {} } as any);
      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });

    it("looks up user by email", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "user@test.com" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u1",
        email: "user@test.com",
        role: "MEMBER",
        companyId: "c1",
      } as any);

      const result = await requireAuth();
      expect(result).toEqual({
        userId: "u1",
        email: "user@test.com",
        role: "MEMBER",
        companyId: "c1",
      });
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { email: "user@test.com", archivedAt: null },
        select: { id: true, email: true, role: true, companyId: true },
      });
    });

    it("returns 401 when user not found in DB", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "ghost@test.com" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue(null);

      const result = await requireAuth();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(401);
    });
  });

  describe("requireRole", () => {
    it("returns auth result when role matches", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "admin@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u1",
        email: "admin@test.com",
        role: "ADMIN",
        companyId: "c1",
      } as any);

      const result = await requireRole("ADMIN", "HR");
      expect(result).not.toBeInstanceOf(NextResponse);
      expect((result as any).role).toBe("ADMIN");
    });

    it("returns 403 when role does not match", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "member@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u2",
        email: "member@test.com",
        role: "MEMBER",
        companyId: "c1",
      } as any);

      const result = await requireRole("ADMIN");
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });
  });

  describe("requireAdminOrHR", () => {
    it("allows ADMIN", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "a@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u1", email: "a@test.com", role: "ADMIN", companyId: "c1",
      } as any);

      const result = await requireAdminOrHR();
      expect(result).not.toBeInstanceOf(NextResponse);
    });

    it("allows HR", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "h@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u2", email: "h@test.com", role: "HR", companyId: "c1",
      } as any);

      const result = await requireAdminOrHR();
      expect(result).not.toBeInstanceOf(NextResponse);
    });

    it("rejects MEMBER", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "m@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u3", email: "m@test.com", role: "MEMBER", companyId: "c1",
      } as any);

      const result = await requireAdminOrHR();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });

    it("rejects EXTERNAL", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "ext@test.com", companyId: "c1" },
      } as any);
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: "u4", email: "ext@test.com", role: "EXTERNAL", companyId: "c1",
      } as any);

      const result = await requireAdminOrHR();
      expect(result).toBeInstanceOf(NextResponse);
      expect((result as NextResponse).status).toBe(403);
    });
  });

  describe("isAuthError", () => {
    it("returns true for NextResponse", () => {
      const res = NextResponse.json({}, { status: 401 });
      expect(isAuthError(res)).toBe(true);
    });

    it("returns false for auth result", () => {
      expect(isAuthError({ userId: "u1", email: "a@test.com", role: "ADMIN", companyId: "c1" } as any)).toBe(false);
    });
  });
});
