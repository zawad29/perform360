-- Step 2: Migrate existing EMPLOYEE rows to MEMBER and remove old enum value
UPDATE "User" SET "role" = 'MEMBER' WHERE "role" = 'EMPLOYEE';

-- Drop default before altering column type, then restore it
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

-- Recreate the enum without EMPLOYEE
ALTER TYPE "UserRole" RENAME TO "UserRole_old";
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'HR', 'MEMBER', 'EXTERNAL');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'MEMBER';
DROP TYPE "UserRole_old";
