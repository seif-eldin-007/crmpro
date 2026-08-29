# Plan 04 — Frontend Finish

**Goal:** take both apps from "works in dev" to shippable UX: no dead routes, guarded routes, resilient error states, realtime that works in production.
**Order:** fourth.
**Status:** ☐ not started

---

## 1. Route integrity (web)

- Recreate `apps/web/src/app/(protected)/settings/page.tsx` rendering the existing `SettingsPage` (currently 404; topbar and notifications already link to it).
- Build the `/lead-sources` page (currently `PagePlaceholder`) — backend CRUD exists; pattern-match the developers/projects pages.
- Add `not-found.tsx` and `/403` page; wire `/403` navigation (it exists in admin but is dead code; web lacks it entirely).

**Accept:** every sidebar/topbar/palette target resolves; no placeholder pages remain.

## 2. Route protection & permissions UX

- Add `middleware.ts` to both apps: redirect unauthenticated hits on protected routes to `/login` (auth check via refresh cookie probe or Next middleware session check), so deep links never flash the protected shell.
- Client permission guard: wrap protected layouts — on 403 from `me/permissions`, route to `/403` instead of rendering error cards.
- Keep action-level `can(...)` checks as UX sugar (API remains the authority).

**Accept:** unauthorized user hitting `/users` directly lands on `/403`; unauthenticated deep link lands on `/login` with no shell flash.

## 3. Error resilience

- Add `error.tsx` + `global-error.tsx` to both apps (retryable, logged).
- Add `loading.tsx`/Suspense to the remaining pages lacking it.

**Accept:** a throwing component degrades to an error card, never a white shell.

## 4. Realtime production config

- `use-realtime.ts` (both apps): remove `http://localhost:*` hardcoded fallbacks; derive socket base from `NEXT_PUBLIC_SSE_URL` or the same-origin API base; fail loud (console.error + disabled state) instead of silently pointing at localhost.
- Document `NEXT_PUBLIC_SSE_URL` in both `.env.example` files.
- Re-sync on reconnect: on socket `connect` after a reconnect, invalidate active query caches once.
- Remove leftover `console.log` noise from both hooks.

**Accept:** in a production build with only standard env vars, notifications/support realtime work; reconnect backfills via invalidation.

## 5. Safe interactions

- Confirm dialogs for destructive actions in web user management (deactivate, revoke sessions) — match the admin app's `tenant-actions.tsx` pattern.
- Fix support draft key: include conversationId (`crmpro_support_draft_<conversationId>`).
- Leads URL state: make filters two-way (shareable/bookmarkable), matching the users module pattern.

**Accept:** no accidental irreversible action; drafts per-thread; lead filter state survives refresh/share.

## 6. Zero lint errors

- Fix the remaining ESLint errors (web 14, admin 9) as part of this plan since several live in files being touched here.

**Accept:** `pnpm lint` clean repo-wide (shared with Plan 02 gate).

## 7. i18n groundwork (scope-limited)

- Introduce `next-intl` in both apps with `en` as the single active locale.
- Extract strings ONLY for: auth flows, app shell (sidebar/topbar/command palette), and common UI primitives (dialogs, toasts, table empty states). Leave feature-page copy as-is.
- Structure ready for `ar` + RTL later (dir-aware root layout already needed for `lang` attr).

**Accept:** locale files exist, shell renders from message catalogs, switching locale constant flips shell copy; no RTL implementation yet.

---

## Out of scope
- Full Arabic translation and RTL layout (separate plan), optimistic updates, bulk-operation batch endpoint (backend enhancement), `/billing` and `/analytics` web pages (product scope decision first).

## Definition of done
All routes resolve, guards + boundaries in place, realtime config production-safe, destructive actions confirmed, lint green, i18n scaffold for shell/auth only.
