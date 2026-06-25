-- Rename Level table to Designation, and levelId/levelIds columns to designationId/designationIds

-- Rename foreign key column on TeamMember
ALTER TABLE "TeamMember" RENAME COLUMN "levelId" TO "designationId";

-- Rename the Level table itself
ALTER TABLE "Level" RENAME TO "Designation";

-- Rename constraints and indexes
ALTER TABLE "Designation" RENAME CONSTRAINT "Level_pkey" TO "Designation_pkey";
ALTER INDEX "Level_companyId_name_key" RENAME TO "Designation_companyId_name_key";

-- Rename levelIds column on EvaluationTemplate
ALTER TABLE "EvaluationTemplate" RENAME COLUMN "levelIds" TO "designationIds";

-- Rename levelIds column on EvaluationTemplateVersion
ALTER TABLE "EvaluationTemplateVersion" RENAME COLUMN "levelIds" TO "designationIds";

-- Update the foreign key constraint on TeamMember to point to Designation
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_levelId_fkey";
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_designationId_fkey"
  FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rename companyId FK constraint on Designation (was Level_companyId_fkey)
ALTER TABLE "Designation" RENAME CONSTRAINT "Level_companyId_fkey" TO "Designation_companyId_fkey";
