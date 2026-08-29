# Plan 05 — Ops Foundation

**Goal:** make the product deployable, recoverable, and observable. Deliberately deferred until hosting (VPS/cloud) is chosen — decisions below list the inputs this plan needs.
**Order:** last.
**Status:** ☐ blocked — awaiting hosting decision (VPS vs managed cloud, region for MENA latency)

---

## Inputs needed before starting

- Hosting target: single VPS (docker compose) vs managed (ECS/Fly/Railway). Default assumption if unspecified: **single VPS + docker compose** (simplest, cheapest for first agencies).
- Domain + TLS story: default Caddy or nginx with Let's Encrypt.
- Object storage: confirm the S3-compatible provider already used by `apps/api` (AWS vars in env) stays.

## 1. Production images

- Fill the three empty Dockerfiles in `docker/production/`: multi-stage (pnpm build → slim runtime), non-root user, healthcheck, pinned Node base.
- `api.Dockerfile`: Nest build + Prisma client from `@crmpro/database`.
- `web.Dockerfile` / `admin.Dockerfile`: Next standalone output (`output: 'standalone'`), runtime env injection for `NEXT_PUBLIC_API_URL=/api/v1` + proxy target.

**Accept:** `docker build` produces runnable images; container starts, `/monitoring/health` answers.

## 2. Production compose + deploy script

- `docker/production/docker-compose.prod.yml`: api, admin-api, web, admin, postgres, redis (+ caddy/nginx TLS edge).
- Secrets via `.env` template (`docker/.env.production.example`): strong random JWT secrets (≥32 chars), `CORS_ORIGINS` set, Redis `requirepass`, Postgres non-default credentials.
- `scripts/deploy.sh`: pull → build → `migrate deploy` → up → smoke check (health endpoints + login probe).

**Accept:** one-command deploy on a fresh VPS from this repo; migrations applied automatically and safely.

## 3. Backups & restore

- `scripts/backup.sh`: nightly `pg_dump` (compressed, dated) → local retention 7 days + S3/off-site retention 90 days; Redis RDB persistence configured with volume.
- `docs/runbooks/restore.md`: step-by-step restore drill, executed and recorded at least once before first customer.
- Optional S3 object lifecycle policy note for uploaded files.

**Accept:** restore drill from a backup file produces a working tenant login — documented evidence.

## 4. Observability & alerting

- Log collection: container logs → at minimum `json-file` with size caps; upgrade path to Loki/Uptime Kuma documented.
- External uptime checks: public `GET` probe (add unauthenticated `GET /up` or expose `/monitoring/health` unauthenticated) + alert channel (email/Telegram).
- Alert on: API down, admin-api down, DB disk >80%, failed backups.

**Accept:** killing the api container triggers an external alert within 5 minutes.

## 5. Data lifecycle automation (from Plan 03)

- Scheduled purge job: tenants terminated >90 days → data deletion procedure (runbook-automated, double-confirm), per Plan 03 retention policy.

## 6. Local compose fixes (do early, no VPS needed)

- `docker-compose.local.yml`: fix Postgres healthcheck (`pg_isready` runs inside container on 5432, not `${POSTGRES_PORT}`); drop obsolete `version` key; non-default dev credentials.

**Accept:** `docker compose -f docker/docker-compose.local.yml up` healthcheck actually passes.

---

## Out of scope
- Kubernetes, multi-region, autoscaling — not needed for the first agencies.
- CI/CD deployment automation (Plan 02's CI stops at test gate; deploy stays script-driven first).

## Definition of done
Fresh-VPS deploy works end to end, backups run and a restore drill passed, external alerting live, purge policy implemented.
