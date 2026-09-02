-- AlterTable
-- Freeze the plan terms (quotas + feature flags) a tenant signed for.
-- Nullable: legacy contracts keep null and fall back to the live plan row.
ALTER TABLE "TenantContract" ADD COLUMN "planSnapshot" JSONB;
