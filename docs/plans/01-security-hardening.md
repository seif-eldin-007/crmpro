# Plan 01 — Security Hardening

**Goal:** close every abuse surface and auth weakness found in the August 2026 audit, before the first paying tenant.
**Order:** first (highest value, no infra needed).
**Status:** ✅ complete (2026-08-29)

---

## 1. Rate limiting (both APIs) ✅

Install `@nestjs/throttler` in `apps/api` and `apps/admin-api`.

- Global default: 100 req/min per IP.
- Auth endpoints (`/auth/login`, `/auth/refresh`): 10 req/min per IP.
- Admin-api login: additionally 5 failures/15 min (`LoginAttemptLimiterService`, per ip+email pair, resets on success).
- Register `ThrottlerGuard` globally; mark health endpoints `@SkipThrottle()`.

**Accept:** 11th login attempt within a minute returns 429 on both APIs; health stays open. — verified live.

## 2. CORS fail-closed ✅

- `apps/api/src/main.ts` + `apps/admin-api/src/main.ts`: remove `origin: true` fallback. If `CORS_ORIGINS` is empty in production → throw at startup; in dev default to the local frontend origins explicitly.
- `env.validation.ts` (both): make `CORS_ORIGINS` required when `NODE_ENV=production`.
- Admin-api WebSocket (`modules/realtime/realtime.gateway.ts`): replace hardcoded `origin: true, credentials: true` with the same configured origins.

**Accept:** request with a foreign `Origin` header is rejected; missing `CORS_ORIGINS` in prod crashes startup with a clear message. — verified live.

## 3. Swagger behind a flag ✅

- `apps/api/src/main.ts`: register Swagger only when `ENABLE_SWAGGER=true` (dev default true, prod default false).

**Accept:** `GET /api/docs` 404s in production config.

## 4. WebSocket hardening (both gateways) ✅

`apps/api/src/modules/realtime/realtime.gateway.ts` and `apps/admin-api/src/modules/realtime/realtime.gateway.ts`:

- On connect: verify JWT **and** load the session row — reject if revoked/expired; for tenant API also assert tenant accessible (mirrors `jwt.strategy.ts`).
- Admin gateway: require a valid admin session; drop any assumption of open rooms.
- `typing` handlers: validate the target room belongs to a conversation the sender participates in (support conversation membership check), no arbitrary `user:<id>` emits.

**Accept:** revoked session cannot open a socket; typing to an unrelated user is rejected; covered by unit tests. — gateway specs green.

## 5. RBAC fail-closed (admin-api) ✅

- `common/auth/guards/admin-permissions.guard.ts`: return `false` (or throw Forbidden) when a route has no permission decorator, instead of `true`.
- Re-audit controllers: every HTTP route must carry `JwtAuthGuard + AdminPermissionsGuard + @RequireAdminPermission` (self-service `me/sessions/permissions` keep auth-only by explicit opt-in marker).

**Accept:** a new route without decorators is denied by default; guard unit test asserts fail-closed. — `admin-permissions.guard.spec.ts` green.

## 6. Admin auth → httpOnly cookie parity ✅

- Admin-api: mirror tenant API auth — refresh token in `httpOnly` `Secure` `SameSite=Lax` cookie (reuse the cookie constants/util pattern from `apps/api`), stop returning the raw refresh token in response bodies (`login`, `refresh`, `logoutAll` payloads normalized to `{success, data}`).
- `apps/admin` frontend: delete `src/lib/api/refresh-token.ts` localStorage storage; send cookies via `credentials: 'include'` through the same-origin proxy.

**Accept:** no refresh token string anywhere in admin frontend storage or network bodies; silent refresh still works. — verified in browser (JS-invisible cookie, empty localStorage, silent refresh on reload).

## 7. CRM refresh-token reuse detection ✅

- `apps/api/src/modules/auth/auth.service.ts` refresh: on verification failure caused by a rotated token (token valid structurally but hash mismatch on a non-revoked session), revoke **all** sessions of that user and log a security event — parity with admin-api behavior.

**Accept:** replaying an old refresh token revokes the whole user's sessions; security event recorded. — verified live + unit test.

## 8. Secret & proxy hygiene ✅

- Joi env validation (both APIs): `JWT_ACCESS_SECRET` / `JWT_REFRESH_*` minimum length 32.
- Express trust proxy: set to `1` (single known hop) instead of `true`, so `x-forwarded-for` cannot be spoofed by clients; keep the manual parser aligned.

**Accept:** short secret fails startup; spoofed `x-forwarded-for` beyond one hop is ignored.

---

## Out of scope
- MFA (future plan), WAF/edge concerns (ops plan), i18n.

## Definition of done
All 8 items implemented, unit tests added for 4/5/7, both API suites green, no new lint errors.
✅ Met — new tests: gateway specs (both APIs), `admin-permissions.guard.spec.ts`, `login-attempt-limiter.service.spec.ts`, reuse-detection case in `auth.service.spec.ts`. Suites green except the 6 pre-existing reds carried into Plan 02.
