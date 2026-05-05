import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { mockAuth, fixtures, createMockRequest, parseResponse } from "../helpers";

const { GET, PATCH, DELETE } = await import("@/app/api/templates/[id]/route");

const validCuid = "clx1abc2def3ghi4jkl5mno6p";
const callWith = (handler: Function, req: any, id: string) =>
  handler(req, { params: { id } });

describe("GET /api/templates/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns template (including global)", async () => {
    mockAuth(fixtures.employee);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
      id: validCuid,
      name: "Standard 360",
      isGlobal: true,
      sections: [],
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.name).toBe("Standard 360");
  });

  it("returns 404 for template not in company/global", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue(null);

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`);
    const res = await callWith(GET, req, validCuid);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/templates/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates company-owned template", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
      id: validCuid,
      companyId: fixtures.admin.companyId,
      isGlobal: false,
      version: 1,
    } as any);
    const updateTpl = vi.fn().mockResolvedValue({
      id: validCuid,
      name: "Updated Template",
      version: 2,
      weightsMember: null,
      weightsManager: null,
      sections: [],
    });
    const createVersion = vi.fn().mockResolvedValue({});
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: any) => {
      if (typeof cb === "function") {
        return cb({
          evaluationTemplate: { update: updateTpl },
          evaluationTemplateVersion: { create: createVersion },
        });
      }
    });

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`, {
      method: "PATCH",
      body: { name: "Updated Template" },
    });
    const res = await callWith(PATCH, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.name).toBe("Updated Template");
    expect(createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ templateId: validCuid, version: 2 }),
      })
    );
  });

  it("returns 404 for global template (not editable)", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue(null);

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`, {
      method: "PATCH",
      body: { name: "Hacked" },
    });
    const res = await callWith(PATCH, req, validCuid);
    expect(res.status).toBe(404);
  });

  it("rejects MEMBER role", async () => {
    mockAuth(fixtures.employee);
    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`, {
      method: "PATCH",
      body: { name: "X" },
    });
    const res = await callWith(PATCH, req, validCuid);
    expect(res.status).toBe(403);
  });
});

describe("DELETE /api/templates/[id] (archive)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("archives company template", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
      id: validCuid,
      companyId: fixtures.admin.companyId,
      isGlobal: false,
      isArchived: false,
    } as any);
    vi.mocked(prisma.evaluationTemplate.update).mockResolvedValue({
      id: validCuid,
      isArchived: true,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(200);
    expect(body.data.archived).toBe(true);
  });

  it("rejects archiving already-archived template", async () => {
    mockAuth(fixtures.admin);
    vi.mocked(prisma.evaluationTemplate.findFirst).mockResolvedValue({
      id: validCuid,
      companyId: fixtures.admin.companyId,
      isGlobal: false,
      isArchived: true,
    } as any);

    const req = createMockRequest(`http://localhost:3000/api/templates/${validCuid}`, { method: "DELETE" });
    const res = await callWith(DELETE, req, validCuid);
    const { status, body } = await parseResponse(res);
    expect(status).toBe(400);
    expect(body.code).toBe("ALREADY_ARCHIVED");
  });
});
