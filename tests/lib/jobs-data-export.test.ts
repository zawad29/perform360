import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendEmailWithAttachments } from "@/lib/email";
import { writeAuditLog } from "@/lib/audit";

vi.mock("@/lib/encryption", () => ({
  decrypt: vi.fn(),
}));

const { decrypt } = await import("@/lib/encryption");
const { handleDataExport } = await import("@/lib/jobs/data-export");

const PAYLOAD = {
  companyId: "company-1",
  userId: "user-1",
  userEmail: "admin@test.com",
  dataKeyHex: Buffer.alloc(32, "k").toString("hex"),
};

function mockCompany() {
  vi.mocked(prisma.company.findUnique).mockResolvedValue({
    id: "company-1",
    name: "Test Corp",
    slug: "test-corp",
    logo: null,
    settings: {},
    keyVersion: 1,
    encryptionSetupAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as never);
}

function mockAllData() {
  vi.mocked(prisma.user.findMany).mockResolvedValue([
    { id: "u1", name: "Alice", teamMemberships: [] },
  ] as never);
  vi.mocked(prisma.team.findMany).mockResolvedValue([
    { id: "t1", name: "Eng", members: [] },
  ] as never);
  vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([]);
  vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);
  vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([]);
  vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
  vi.mocked(prisma.recoveryCode.findMany).mockResolvedValue([]);
}

describe("handleDataExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when company not found", async () => {
    vi.mocked(prisma.company.findUnique).mockResolvedValue(null);

    await expect(handleDataExport(PAYLOAD)).rejects.toThrow(
      "Company not found: company-1"
    );
  });

  it("exports all company data and sends via email", async () => {
    mockCompany();
    mockAllData();

    await handleDataExport(PAYLOAD);

    expect(prisma.user.findMany).toHaveBeenCalled();
    expect(prisma.team.findMany).toHaveBeenCalled();
    expect(prisma.evaluationTemplate.findMany).toHaveBeenCalled();
    expect(prisma.evaluationCycle.findMany).toHaveBeenCalled();
    expect(prisma.evaluationAssignment.findMany).toHaveBeenCalled();
    expect(prisma.auditLog.findMany).toHaveBeenCalled();
    expect(prisma.recoveryCode.findMany).toHaveBeenCalled();

    expect(sendEmailWithAttachments).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@test.com",
        subject: "Your Test Corp data export is ready",
        attachments: expect.arrayContaining([
          expect.objectContaining({
            contentType: "application/json",
          }),
        ]),
      })
    );

    // Verify filename format
    const attachment = vi.mocked(sendEmailWithAttachments).mock.calls[0][0].attachments[0];
    expect(attachment.filename).toMatch(/^performs360-test-corp-data-dump-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("decrypts evaluation responses in export", async () => {
    mockCompany();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.team.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      {
        id: "a1",
        cycleId: "c1",
        templateId: "t1",
        subjectId: "u1",
        reviewerId: "u2",
        direction: "LATERAL",
        status: "SUBMITTED",
        token: "tok",
        createdAt: new Date(),
        otpSessions: [],
        responses: [
          {
            id: "r1",
            assignmentId: "a1",
            reviewerId: "u2",
            subjectId: "u1",
            keyVersion: 1,
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            answersEncrypted: "encrypted-data",
            answersIv: "iv-data",
            answersTag: "tag-data",
          },
        ],
      },
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.recoveryCode.findMany).mockResolvedValue([]);

    vi.mocked(decrypt).mockReturnValue('{"q1": 4, "q2": "Good work"}');

    await handleDataExport(PAYLOAD);

    expect(decrypt).toHaveBeenCalledWith(
      "encrypted-data",
      "iv-data",
      "tag-data",
      expect.any(Buffer)
    );

    // Check that decrypted answers are in the JSON content
    const content = vi.mocked(sendEmailWithAttachments).mock.calls[0][0].attachments[0].content as string;
    const parsed = JSON.parse(content);
    expect(parsed.assignments[0].responses[0].answers).toEqual({
      q1: 4,
      q2: "Good work",
    });
  });

  it("handles non-JSON plaintext answers gracefully", async () => {
    mockCompany();
    vi.mocked(prisma.user.findMany).mockResolvedValue([]);
    vi.mocked(prisma.team.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationTemplate.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationCycle.findMany).mockResolvedValue([]);
    vi.mocked(prisma.evaluationAssignment.findMany).mockResolvedValue([
      {
        id: "a1",
        cycleId: "c1",
        templateId: "t1",
        subjectId: "u1",
        reviewerId: "u2",
        direction: "LATERAL",
        status: "SUBMITTED",
        token: "tok",
        createdAt: new Date(),
        otpSessions: [],
        responses: [
          {
            id: "r1",
            assignmentId: "a1",
            reviewerId: "u2",
            subjectId: "u1",
            keyVersion: 1,
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            answersEncrypted: "enc",
            answersIv: "iv",
            answersTag: "tag",
          },
        ],
      },
    ] as never);
    vi.mocked(prisma.auditLog.findMany).mockResolvedValue([]);
    vi.mocked(prisma.recoveryCode.findMany).mockResolvedValue([]);

    // Return non-JSON string
    vi.mocked(decrypt).mockReturnValue("plain text answer");

    await handleDataExport(PAYLOAD);

    const content = vi.mocked(sendEmailWithAttachments).mock.calls[0][0].attachments[0].content as string;
    const parsed = JSON.parse(content);
    // safeParseAnswers returns the raw string when JSON.parse fails
    expect(parsed.assignments[0].responses[0].answers).toBe("plain text answer");
  });

  it("writes audit log after successful export", async () => {
    mockCompany();
    mockAllData();

    await handleDataExport(PAYLOAD);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        userId: "user-1",
        action: "data_export",
        metadata: expect.objectContaining({
          deliveredTo: "admin@test.com",
          source: "background_job",
        }),
      })
    );
  });

  it("includes metadata in export payload", async () => {
    mockCompany();
    mockAllData();

    await handleDataExport(PAYLOAD);

    const content = vi.mocked(sendEmailWithAttachments).mock.calls[0][0].attachments[0].content as string;
    const parsed = JSON.parse(content);

    expect(parsed.metadata.schemaVersion).toBe(1);
    expect(parsed.metadata.exportedBy.userId).toBe("user-1");
    expect(parsed.metadata.exportedBy.email).toBe("admin@test.com");
    expect(parsed.metadata.exportedAt).toBeTruthy();
  });

  it("includes all data sections in export", async () => {
    mockCompany();
    mockAllData();

    await handleDataExport(PAYLOAD);

    const content = vi.mocked(sendEmailWithAttachments).mock.calls[0][0].attachments[0].content as string;
    const parsed = JSON.parse(content);

    expect(parsed).toHaveProperty("company");
    expect(parsed).toHaveProperty("users");
    expect(parsed).toHaveProperty("teams");
    expect(parsed).toHaveProperty("templates");
    expect(parsed).toHaveProperty("cycles");
    expect(parsed).toHaveProperty("assignments");
    expect(parsed).toHaveProperty("auditLogs");
    expect(parsed).toHaveProperty("recoveryCodes");
  });
});
