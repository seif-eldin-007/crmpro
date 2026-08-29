# Plan 03 — Commercial Correctness

**Goal:** make plan/contract/termination semantics safe for real paying tenants — no retroactive entitlement changes, predictable end-of-contract behavior.
**Order:** third.
**Status:** ☐ not started

---

## 1. Plan snapshot at contract signing

Contract currently stores only a live `planId`; editing a plan retroactively changes limits/flags for already-signed tenants.

- Migration: add `planSnapshot Json` on `TenantContract` (nullable only for legacy rows).
- `contracts.service.ts` create/activate: capture `{ planId, name, price, quotas: {maxUsers, maxLeads, maxProjects, maxStorageBytes}, featureFlags: {...} }` from the plan at signing time into `planSnapshot`.
- Tenant-side entitlement resolution (`apps/api/src/common/entitlements/plan-entitlement.service.ts` and `common/quota/quota.service.ts`): prefer the active contract's `planSnapshot` over live `SubscriptionPlan` rows; fall back to live plan only when snapshot is null (legacy).
- Admin-api `ContractEntitlementSyncService`: keep syncing `tenant.subscriptionPlanId`, but stop mutating entitlements derived from live plans when a snapshot exists.
- Admin UI (`apps/admin` contract detail): display the snapshot limits, clearly separated from the current live plan.

**Accept:** edit a plan after signing → signed tenant's quotas/flags unchanged; new contracts pick up new values; unit tests cover both paths.

## 2. Termination data lifecycle

`terminateContract` currently only flips status and logs `accessUntil` — tenant stays ACTIVE, sessions stay live.

- On terminate: set tenant status `SUSPENDED`, revoke **all** tenant user sessions, keep the grace window (`accessUntil`) semantics intact in `tenant-access.service.ts`.
- Rewrite `contracts.service.terminate.spec.ts` (un-skips Plan 02's deferred item) to assert: tenant suspended + sessions revoked + access via grace honored until `accessUntil`.
- Admin UI: termination dialog states the effect explicitly ("tenant will be suspended immediately; access ends <date>").
- Document the retention policy in `docs/architecture/`: suspended+terminated data retained 90 days, export available on request, deletion is an ops-run manual procedure (automated purge job lands with Plan 05).

**Accept:** terminating a contract immediately blocks tenant logins and API access (except grace read semantics as defined in `tenant-access.service.ts`); test proves it.

## 3. Background workers respect suspension

Audit finding: import/export workers keep processing for suspended tenants.

- Import job processor (`apps/api/src/modules/import-jobs/`): before processing each job, assert tenant accessible; if suspended → fail/park the job with a clear status, do not mutate tenant data.
- Export + cleanup processors: same check.
- Unit test per processor.

**Accept:** enqueuing a job for a suspended tenant never writes data; job records a meaningful status.

## 4. Audit-write atomicity (admin-api, small)

- Move `AdminAuditLog` writes for contract/tenant/plan mutations **inside** the business transaction where the service already opens one (contracts create/update/terminate, tenant suspend). Leave auth/security event logs as-is (fire-and-forget is acceptable there).

**Accept:** a failing audit write rolls back the business action (demonstrated in a unit test for contract create).

## 5. Documented policy decisions

Record in `docs/architecture/permissions.md` or a new `commercial-policy.md`:

- Deactivated (not deleted) users do **not** count toward the user quota — intentional loophole documented as policy (decision point: keep or count; default: keep, document).
- 90-day retention, export-on-request, manual deletion.

---

## Out of scope
- Automated data purge job (Plan 05), self-service billing/payment integration (future), usage metering beyond current counts.

## Definition of done
Snapshot enforced end-to-end, termination suspends + revokes, workers skip suspended tenants, audit writes transactional, policies documented, admin-api suite green (including the rewritten terminate spec).
