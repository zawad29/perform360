-- Template versioning: counter on the main row + append-only history table.

ALTER TABLE "EvaluationTemplate"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "EvaluationTemplateVersion" (
  "id"             TEXT PRIMARY KEY,
  "templateId"     TEXT NOT NULL,
  "version"        INTEGER NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "levelIds"       TEXT[] NOT NULL DEFAULT '{}',
  "weightPreset"   "WeightPreset",
  "weightsMember"  JSONB,
  "weightsManager" JSONB,
  "sections"       JSONB NOT NULL,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluationTemplateVersion_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "EvaluationTemplate"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "EvaluationTemplateVersion_templateId_version_key"
  ON "EvaluationTemplateVersion"("templateId", "version");

CREATE INDEX "EvaluationTemplateVersion_templateId_idx"
  ON "EvaluationTemplateVersion"("templateId");

-- Backfill v1 for every existing template so each one has a starting snapshot.
INSERT INTO "EvaluationTemplateVersion" (
  "id", "templateId", "version", "name", "description", "levelIds",
  "weightPreset", "weightsMember", "weightsManager", "sections", "createdBy", "createdAt"
)
SELECT
  -- Generate stable cuid-ish ids; PostgreSQL doesn't have cuid built in,
  -- so we synthesize one with a prefix + random hex. Good enough for backfill.
  'tplv_' || SUBSTRING(MD5(RANDOM()::TEXT || "id") FOR 24),
  "id",
  1,
  "name",
  "description",
  "levelIds",
  "weightPreset",
  "weightsMember",
  "weightsManager",
  "sections",
  "createdBy",
  "createdAt"
FROM "EvaluationTemplate";
