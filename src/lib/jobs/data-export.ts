import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { writeAuditLog } from "@/lib/audit";
import { getDataExportEmail, sendEmailWithAttachments } from "@/lib/email";
import type { DataExportPayload } from "@/types/job";

function safeParseAnswers(
  answersEncrypted: string,
  answersIv: string,
  answersTag: string,
  dataKey: Buffer
): unknown {
  const plaintext = decrypt(answersEncrypted, answersIv, answersTag, dataKey);
  try {
    return JSON.parse(plaintext);
  } catch {
    return plaintext;
  }
}

export async function handleDataExport(
  payload: DataExportPayload
): Promise<void> {
  const { companyId, userId, userEmail, dataKeyHex } = payload;
  const dataKey = Buffer.from(dataKeyHex, "hex");

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      settings: true,
      keyVersion: true,
      encryptionSetupAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!company) throw new Error(`Company not found: ${companyId}`);

  const [users, teams, templates, cycles, assignments, auditLogs, recoveryCodes] =
    await Promise.all([
      prisma.user.findMany({
        where: { companyId: company.id },
        include: {
          teamMemberships: {
            select: { id: true, teamId: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.team.findMany({
        where: { companyId: company.id },
        include: {
          members: {
            select: { id: true, userId: true, role: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.evaluationTemplate.findMany({
        where: {
          OR: [
            { companyId: company.id },
            {
              cycleTeamTemplates: {
                some: {
                  cycleTeam: { cycle: { companyId: company.id } },
                },
              },
            },
          ],
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.evaluationCycle.findMany({
        where: { companyId: company.id },
        include: {
          cycleTeams: {
            select: {
              id: true,
              teamId: true,
              templates: { select: { templateId: true } },
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.evaluationAssignment.findMany({
        where: {
          cycle: { companyId: company.id },
        },
        include: {
          otpSessions: true,
          responses: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.auditLog.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.recoveryCode.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

  const assignmentsDecrypted = assignments.map((assignment) => ({
    id: assignment.id,
    cycleId: assignment.cycleId,
    templateId: assignment.templateId,
    subjectId: assignment.subjectId,
    reviewerId: assignment.reviewerId,
    direction: assignment.direction,
    status: assignment.status,
    token: assignment.token,
    createdAt: assignment.createdAt,
    otpSessions: assignment.otpSessions,
    responses: assignment.responses.map((response) => ({
      id: response.id,
      assignmentId: response.assignmentId,
      reviewerId: response.reviewerId,
      subjectId: response.subjectId,
      keyVersion: response.keyVersion,
      submittedAt: response.submittedAt,
      createdAt: response.createdAt,
      updatedAt: response.updatedAt,
      answers: safeParseAnswers(
        response.answersEncrypted,
        response.answersIv,
        response.answersTag,
        dataKey
      ),
    })),
  }));

  const exportedAt = new Date().toISOString();
  const exportPayload = {
    metadata: {
      schemaVersion: 1,
      exportedAt,
      exportedBy: { userId, email: userEmail },
    },
    company: {
      id: company.id,
      name: company.name,
      slug: company.slug,
      logo: company.logo,
      settings: company.settings,
      keyVersion: company.keyVersion,
      encryptionSetupAt: company.encryptionSetupAt,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
    users,
    teams,
    templates,
    cycles,
    assignments: assignmentsDecrypted,
    auditLogs,
    recoveryCodes,
  };

  const fileName = `performs360-${company.slug}-data-dump-${exportedAt.slice(0, 10)}.json`;
  const jsonContent = JSON.stringify(exportPayload, null, 2);

  const { html, text } = getDataExportEmail(company.name, exportedAt.slice(0, 10));

  await sendEmailWithAttachments({
    to: userEmail,
    subject: `Your ${company.name} data export is ready`,
    html,
    text,
    attachments: [
      {
        filename: fileName,
        content: jsonContent,
        contentType: "application/json",
      },
    ],
  });

  await writeAuditLog({
    companyId,
    userId,
    action: "data_export",
    metadata: {
      deliveredTo: userEmail,
      source: "background_job",
    },
  });

  console.log(
    `[Jobs] Data export complete for company ${companyId}: emailed to ${userEmail}`
  );
}
