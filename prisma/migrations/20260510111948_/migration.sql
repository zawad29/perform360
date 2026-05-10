-- DropForeignKey
ALTER TABLE "EvaluationTemplateVersion" DROP CONSTRAINT "EvaluationTemplateVersion_templateId_fkey";

-- AddForeignKey
ALTER TABLE "EvaluationTemplateVersion" ADD CONSTRAINT "EvaluationTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
