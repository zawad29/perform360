-- CreateEnum
CREATE TYPE "TemplateAssignmentSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateTable
CREATE TABLE "CycleSubjectTemplate" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "templateId" TEXT,
    "source" "TemplateAssignmentSource" NOT NULL DEFAULT 'AUTO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleSubjectTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CycleSubjectTemplate_cycleId_idx" ON "CycleSubjectTemplate"("cycleId");

-- CreateIndex
CREATE INDEX "CycleSubjectTemplate_cycleId_teamId_idx" ON "CycleSubjectTemplate"("cycleId", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleSubjectTemplate_cycleId_subjectId_teamId_key" ON "CycleSubjectTemplate"("cycleId", "subjectId", "teamId");

-- AddForeignKey
ALTER TABLE "CycleSubjectTemplate" ADD CONSTRAINT "CycleSubjectTemplate_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "EvaluationCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

