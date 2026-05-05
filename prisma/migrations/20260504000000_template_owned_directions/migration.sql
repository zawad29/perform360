-- Template-owned directions, levels, and weights refactor
-- Clean cut: drops legacy direction-overrides, adds Direction enum,
-- adds template-level levelIds/weights, replaces single CycleTeam.templateId
-- with CycleTeamTemplate join, renames EvaluationAssignment.relationship
-- to direction.

-- Direction enum
CREATE TYPE "Direction" AS ENUM ('DOWNWARD', 'UPWARD', 'LATERAL', 'SELF', 'EXTERNAL');

-- Drop legacy override table
DROP TABLE IF EXISTS "CycleTeamLevelTemplate";

-- Drop deprecated columns from CycleTeam (single template + weights)
ALTER TABLE "CycleTeam"
  DROP COLUMN IF EXISTS "templateId",
  DROP COLUMN IF EXISTS "weightManager",
  DROP COLUMN IF EXISTS "weightPeer",
  DROP COLUMN IF EXISTS "weightDirectReport",
  DROP COLUMN IF EXISTS "weightSelf",
  DROP COLUMN IF EXISTS "weightExternal",
  DROP COLUMN IF EXISTS "weightPreset",
  DROP COLUMN IF EXISTS "mgrWeightManager",
  DROP COLUMN IF EXISTS "mgrWeightPeer",
  DROP COLUMN IF EXISTS "mgrWeightDirectReport",
  DROP COLUMN IF EXISTS "mgrWeightSelf",
  DROP COLUMN IF EXISTS "mgrWeightExternal";

-- New join model: CycleTeamTemplate
CREATE TABLE "CycleTeamTemplate" (
  "id" TEXT NOT NULL,
  "cycleTeamId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  CONSTRAINT "CycleTeamTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CycleTeamTemplate_cycleTeamId_templateId_key"
  ON "CycleTeamTemplate"("cycleTeamId", "templateId");
CREATE INDEX "CycleTeamTemplate_cycleTeamId_idx"
  ON "CycleTeamTemplate"("cycleTeamId");

ALTER TABLE "CycleTeamTemplate"
  ADD CONSTRAINT "CycleTeamTemplate_cycleTeamId_fkey"
    FOREIGN KEY ("cycleTeamId") REFERENCES "CycleTeam"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CycleTeamTemplate"
  ADD CONSTRAINT "CycleTeamTemplate_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Template-owned levels & weights
ALTER TABLE "EvaluationTemplate"
  ADD COLUMN "levelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "weightPreset" TEXT,
  ADD COLUMN "weightsMember" JSONB,
  ADD COLUMN "weightsManager" JSONB;

-- EvaluationAssignment: rename relationship -> direction (Direction enum)
ALTER TABLE "EvaluationAssignment"
  DROP CONSTRAINT IF EXISTS "EvaluationAssignment_cycleId_subjectId_reviewerId_templateI_key";
DROP INDEX IF EXISTS "EvaluationAssignment_cycleId_subjectId_reviewerId_templateI_key";

ALTER TABLE "EvaluationAssignment"
  DROP COLUMN "relationship",
  ADD COLUMN "direction" "Direction" NOT NULL;

CREATE UNIQUE INDEX "EvaluationAssignment_cycleId_subjectId_reviewerId_templateI_key"
  ON "EvaluationAssignment"("cycleId", "subjectId", "reviewerId", "templateId", "direction");

-- TeamMember: rename impersonatorRelationships (TEXT[]) -> impersonatorDirections (Direction[])
ALTER TABLE "TeamMember"
  DROP COLUMN "impersonatorRelationships",
  ADD COLUMN "impersonatorDirections" "Direction"[] NOT NULL DEFAULT ARRAY[]::"Direction"[];
