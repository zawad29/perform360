-- CreateEnum
CREATE TYPE "TemplateRole" AS ENUM ('MANAGER', 'MEMBER', 'ANY');

-- AlterTable
ALTER TABLE "EvaluationTemplate" ADD COLUMN     "appliesToRole" "TemplateRole" NOT NULL DEFAULT 'ANY';

-- AlterTable
ALTER TABLE "EvaluationTemplateVersion" ADD COLUMN     "appliesToRole" "TemplateRole" NOT NULL DEFAULT 'ANY';
