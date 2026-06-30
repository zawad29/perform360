import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, mockNoAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET, POST } = await import("@/app/api/templates/route");

describe("API /api/templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/templates", () => {
    it("returns 401 when unauthenticated", async () => {
      mockNoAuth();
      const req = createMockRequest("http://localhost:3000/api/templates");
      const res = await GET(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(401);
    });

    it("returns paginated templates", async () => {
      mockAuth(fixtures.admin);
      const mockTemplates = [
        { id: "tpl-1", name: "Standard Review", companyId: fixtures.admin.companyId },
      ];
      vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue(mockTemplates as any);
      vi.mocked(prisma.evaluationTemplate.count).mockResolvedValue(1);

      const req = createMockRequest("http://localhost:3000/api/templates");
      const res = await GET(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it("filters by global scope", async () => {
      mockAuth(fixtures.admin);
      vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([]);
      vi.mocked(prisma.evaluationTemplate.count).mockResolvedValue(0);

      const req = createMockRequest("http://localhost:3000/api/templates?scope=global");
      await GET(req as any);

      expect(prisma.evaluationTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ isGlobal: true }),
              expect.objectContaining({ isArchived: false }),
            ]),
          }),
        })
      );
    });
  });

  describe("POST /api/templates", () => {
    it("returns 403 for MEMBER role", async () => {
      mockAuth(fixtures.employee);
      const req = createMockRequest("http://localhost:3000/api/templates", {
        method: "POST",
        body: {
          name: "Template",
          sections: [{ id: "s1", title: "Section 1", questions: [{ id: "q1", text: "Q?", type: "text", required: true }] }],
        },
      });
      const res = await POST(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(403);
    });

    it("creates template with valid data", async () => {
      mockAuth(fixtures.admin);
      const mockTemplate = {
        id: "tpl-new",
        name: "New Template",
        companyId: fixtures.admin.companyId,
      };
      const createTpl = vi.fn().mockResolvedValue(mockTemplate);
      const createVersion = vi.fn().mockResolvedValue({});
      vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
        if (typeof cb === "function") {
          return cb({
            evaluationTemplate: { create: createTpl },
            evaluationTemplateVersion: { create: createVersion },
          });
        }
        return mockTemplate;
      });

      const req = createMockRequest("http://localhost:3000/api/templates", {
        method: "POST",
        body: {
          name: "New Template",
          description: "A description",
          sections: [{
            id: "s1",
            title: "Performance",
            questions: [
              {
                id: "q1",
                text: "Rate performance",
                type: "rating_scale",
                required: true,
                guideline: "<p>Cover results, quality, and ownership.</p>",
                scaleMin: 1,
                scaleMax: 5,
              },
            ],
          }],
        },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);

      expect(status).toBe(201);
      expect(body.success).toBe(true);
      expect(createTpl).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: "New Template",
            companyId: fixtures.admin.companyId,
            createdBy: fixtures.admin.userId,
            isGlobal: false,
            sections: expect.arrayContaining([
              expect.objectContaining({
                id: "s1",
                title: "Performance",
                questions: expect.arrayContaining([
                  expect.objectContaining({
                    id: "q1",
                    guideline: "<p>Cover results, quality, and ownership.</p>",
                  }),
                ]),
              }),
            ]),
          }),
        })
      );
      expect(createVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ templateId: "tpl-new", version: 1 }),
        })
      );
    });

    it("returns 400 for empty sections", async () => {
      mockAuth(fixtures.admin);
      const req = createMockRequest("http://localhost:3000/api/templates", {
        method: "POST",
        body: { name: "Template", sections: [] },
      });
      const res = await POST(req as any);
      const { status, body } = await parseResponse(res);
      expect(status).toBe(400);
      expect(body.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 for missing name", async () => {
      mockAuth(fixtures.admin);
      const req = createMockRequest("http://localhost:3000/api/templates", {
        method: "POST",
        body: {
          sections: [{ id: "s1", title: "S", questions: [{ id: "q1", text: "Q", type: "text", required: true }] }],
        },
      });
      const res = await POST(req as any);
      const { status } = await parseResponse(res);
      expect(status).toBe(400);
    });
  });
});
