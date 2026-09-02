# Commercial Policy

Authoritative record of the commercial-correctness decisions landed with
Plan 03 (see `docs/plans/03-commercial-correctness.md`). When code and this
document disagree, this document describes the intended policy — fix the code.

## 1. Plan snapshots (frozen terms at signing)

- Every contract captures a `planSnapshot` (JSON) of the plan's commercial
  terms — name, price, quotas (`maxUsers`, `maxLeads`, `maxProjects`,
  `maxStorageBytes`) and feature flags — **at creation and re-captured at
  activation** (the signing moment) and whenever the contract's plan changes.
- Runtime entitlement resolution on the tenant API
  (`plan-entitlement.service.ts`, `quota.service.ts`) prefers the snapshot of
  the tenant's **ACTIVE** contract over the live `SubscriptionPlan` row.
  Editing a plan therefore never retroactively changes what a signed tenant
  gets; new contracts pick up the new values.
- Legacy contracts (snapshot `null`, signed before Plan 03) fall back to the
  live plan row.
- `maxStorageBytes` is serialized as a decimal string inside the snapshot
  because JSON cannot represent BigInt.
- `ContractEntitlementSyncService` keeps syncing `tenant.subscriptionPlanId`
  (the plan pointer) but does not derive entitlements from the live plan when
  a snapshot exists.

## 2. Termination lifecycle

Terminating a contract is an immediate enforcement action, not just a status
flip. Inside one transaction, `terminateContract`:

1. sets the contract status to `TERMINATED`;
2. suspends the linked tenant (`Tenant.status = SUSPENDED`), unless already
   suspended;
3. revokes **all** user sessions of that tenant (`UserSession.revokedAt`);
4. writes the `CONTRACT_TERMINATED` audit log with `accessUntil`,
   `tenantSuspended` and `revokedSessions`.

Consequences:

- Tenant logins and API access are blocked immediately
  (`tenant-access.service.ts` rejects SUSPENDED tenants before any grace
  evaluation).
- The grace window (`contractEndAt + gracePeriodDays`, or termination time +
  grace for open-ended contracts) still defines the recorded `accessUntil` —
  the last moment the tenant *may* operate under the contract — and continues
  to govern the EXPIRED-contract path, where the tenant is not suspended and
  read/API access persists until `accessUntil`.
- Re-activation is an explicit admin action (`reactivateTenant`) plus a new
  or re-activated contract; it is never automatic.

## 3. Data retention after suspension/termination

- Suspended + terminated tenant data is **retained for 90 days**.
- During retention, a full data export is available **on request**
  (ops-assisted; the tenant-side export jobs are blocked while suspended).
- Deletion after retention is an **ops-run manual procedure**. An automated
  purge job is deliberately deferred to Plan 05 (Ops Foundation).

## 4. Background workers and suspended tenants

- Import/export job processing asserts the tenant is active **before**
  claiming the job; suspended or cancelled tenants get the job marked
  `FAILED` with reason "Tenant is inactive." — no tenant data is mutated.
- The cleanup sweeper never re-queues stale jobs for suspended/cancelled
  tenants; it parks them as `FAILED` with reason "Tenant is suspended or
  cancelled; job cannot run."

## 5. Audit-write atomicity

- `AdminAuditLog` writes for contract create/update/activate/terminate and
  tenant suspend happen **inside** the business transaction: a failing audit
  write rolls back the commercial action. An unaudited mutation must never
  survive.
- Auth/security event logs remain fire-and-forget by design (availability of
  login flows outranks audit completeness there).

## 6. User quota counting (documented loophole)

- The user quota counts only **active** users
  (`deletedAt = null AND isActive = true`).
- Deactivated (but not deleted) users therefore do **not** count toward
  `maxUsers`. This is an intentional policy decision: agencies park seasonal
  staff without paying for seats, and re-activation is admin-controlled.
- Decision point retained: if abuse appears (mass deactivate/reactivate
  cycling to dodge quotas), switch counting to all non-deleted users — this
  document must be updated together with `quota.service.ts`.
