-- Rename EMPLOYEE → MEMBER in UserRole enum
-- PostgreSQL does not support renaming enum values directly;
-- we add the new value, migrate existing rows, then remove the old value.

ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MEMBER';

UPDATE "User" SET "role" = 'MEMBER' WHERE "role" = 'EMPLOYEE';

-- Remove EMPLOYEE from the enum by recreating it
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HR', 'MEMBER', 'EXTERNAL');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "UserRole_old";
