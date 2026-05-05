-- WeightPreset enum migration + missing indexes from review feedback.

-- Create the enum
CREATE TYPE "WeightPreset" AS ENUM ('equal', 'supervisor_focus', 'peer_focus', 'custom');

-- Convert EvaluationTemplate.weightPreset from String to enum.
-- Existing values are already lowercase strings matching the enum.
ALTER TABLE "EvaluationTemplate"
  ALTER COLUMN "weightPreset" TYPE "WeightPreset" USING "weightPreset"::"WeightPreset";

-- Indexes flagged by review:
--   EvaluationAssignment(reviewerId), EvaluationAssignment(templateId)
--   OtpSession(assignmentId), OtpSession(reviewerLinkId)
--   TeamMember(userId)
--   CycleTeamTemplate(templateId)
CREATE INDEX IF NOT EXISTS "EvaluationAssignment_reviewerId_idx" ON "EvaluationAssignment"("reviewerId");
CREATE INDEX IF NOT EXISTS "EvaluationAssignment_templateId_idx" ON "EvaluationAssignment"("templateId");
CREATE INDEX IF NOT EXISTS "OtpSession_assignmentId_idx" ON "OtpSession"("assignmentId");
CREATE INDEX IF NOT EXISTS "OtpSession_reviewerLinkId_idx" ON "OtpSession"("reviewerLinkId");
CREATE INDEX IF NOT EXISTS "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX IF NOT EXISTS "CycleTeamTemplate_templateId_idx" ON "CycleTeamTemplate"("templateId");
