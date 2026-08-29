# Plan 02 — Quality Gates

**Goal:** make regressions impossible to merge silently: green tests, real lint gates, CI on every PR.
**Order:** second.
**Status:** ☑ complete

---

## 1. Fix the red suite (6 failing tests)

- `apps/api/src/modules/monitoring/monitoring.controller.spec.ts` — DI resolution error; fix provider list or mock.
- `apps/api/src/modules/notifications/channels/in-app-notification.channel.spec.ts` — fix to match current channel implementation.
- `apps/admin-api/src/modules/contracts/contracts.service.terminate.spec.ts` — currently asserts "terminate without suspending"; this test will be rewritten inside **Plan 03** when termination semantics change — mark/skip with a clear TODO reference to Plan 03 rather than force-greening it.

**Accept:** `pnpm --filter api test` and `pnpm --filter admin-api test` exit 0 (excluding the deliberately skipped Plan-03 test).

## 2. Make tests a workspace task

- Root `package.json`: add `test`, `lint`, `typecheck` scripts delegating to turbo.
- `turbo.json`: add `test` task (`dependsOn: ["build"]` only where needed; `outputs: []`), `typecheck` task.
- API `package.json` scripts: `lint` → plain `eslint` (no `--fix`), add `lint:fix` separately; add `typecheck: tsc --noEmit` if missing.

**Accept:** `pnpm test` / `pnpm lint` / `pnpm typecheck` from repo root cover all apps/packages that have them.

## 3. Fix existing lint errors

- `apps/web`: 14 errors / 10 warnings (react-hooks setState-in-effect in topbar/dialogs, unescaped entities, unused vars).
- `apps/admin`: 9 errors / 8 warnings.
- API apps: verify zero lint errors under non-fix mode.

**Accept:** `pnpm lint` exits 0 repo-wide. (Warnings may remain only if explicitly justified in-line.)

## 4. GitHub Actions CI

Create `.github/workflows/ci.yml`:

- Triggers: PRs to `main`/`develop` + pushes to `main`.
- Setup: pnpm (frozen lockfile), Node from `.nvmrc`/engines (pin 22), Postgres service container for DB-touching tests.
- Steps: `pnpm install --frozen-lockfile` → `pnpm build` (turbo, cached) → `pnpm lint` → `pnpm typecheck` → `pnpm test`.
- Cache: turbo remote/local cache + pnpm store.
- Branch protection guidance documented in the PR description of the CI commit (manual GitHub settings step).

**Accept:** workflow green on a test branch; a deliberately broken test fails the check.

## 5. Clean dead/misleading test plumbing

- `apps/api/package.json`: `test:e2e` points to non-existent `test/jest-e2e.json` — remove the script now (real e2e harness is a future plan, not fake wiring).
- Delete junk files confirmed unused: `apps/api/check.ts`, `apps/api/fix.js`, `apps/api/fix.ts`, `apps/api/query.sql` (verify no references first).

**Accept:** scripts only reference things that exist; junk gone.

---

## Out of scope
- e2e/integration test harness (future plan after deployment story exists).
- Frontend tests (Playwright/component) — future plan; quality bar here is "backend green + build/lint gates".

## Definition of done
All suites green, `pnpm lint/typecheck/test` wired through turbo, CI workflow merged and passing on a real branch.
