# CRMPro Hardening Roadmap

Post-audit workstreams (audit: August 2026). Executed strictly in order, one plan at a time.
Each plan file is self-contained with acceptance criteria and a definition of done.

| # | Plan | Focus | Status |
|---|---|---|---|
| 01 | [Security Hardening](./01-security-hardening.md) | rate limiting, CORS fail-closed, WebSocket auth, RBAC fail-closed, cookie parity, token reuse detection | ✅ complete |
| 02 | [Quality Gates](./02-quality-gates.md) | fix red tests, turbo test/lint/typecheck tasks, GitHub Actions CI | ✅ complete |
| 03 | [Commercial Correctness](./03-commercial-correctness.md) | plan snapshots, termination lifecycle, suspended-tenant workers, atomic audit | ☐ not started |
| 04 | [Frontend Finish](./04-frontend-finish.md) | dead routes, route guards, error boundaries, realtime prod config, i18n groundwork | ☐ not started |
| 05 | [Ops Foundation](./05-ops-foundation.md) | Dockerfiles, prod compose, backups, alerting — **deferred until hosting/VPS is chosen** | ☐ blocked |

## Working agreement

- Work one plan per focused session; tick boxes in the plan file as items land.
- Every plan ends with the relevant suites green and no new lint errors.
- Plan 05 intentionally last: no VPS/hosting exists yet, so deployment work is staged but not started. Its only non-deferred item is the local compose healthcheck fix (§6).
