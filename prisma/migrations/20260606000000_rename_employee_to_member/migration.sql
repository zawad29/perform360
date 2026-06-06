-- Rename EMPLOYEE → MEMBER in UserRole enum
-- PostgreSQL requires ADD VALUE to be committed before the new value can be used,
-- so we split this into two steps using a DO block to force a sub-transaction commit.

-- Step 1: Add the new enum value (committed immediately via its own statement)
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MEMBER';
