/**
 * Non-httpOnly "session hint" cookie.
 *
 * The real session lives in the httpOnly `crm_refresh` cookie, which is scoped
 * to `/api/v1/auth` and therefore is NOT sent on document requests to app
 * routes (`/dashboard`, `/tenants`, ...). Middleware cannot read it, so we keep
 * a lightweight, JS-readable hint cookie (Path=/) in sync with auth state.
 *
 * Middleware uses this purely as an early-redirect optimisation so unauthenticated
 * deep links never flash the protected shell. The client bootstrap remains the
 * authority for real session validity and clears the hint whenever the session
 * is gone.
 */
export const SESSION_HINT_COOKIE = "crm_session_hint";

/**
 * 30 days — intentionally longer than the refresh token so a browser restart
 * never strands a still-valid session on /login. A stale hint (session already
 * invalid) is corrected on the next client bootstrap, which clears it.
 */
const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function setSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=1; path=/; max-age=${SESSION_HINT_MAX_AGE_SECONDS}; samesite=lax`;
}

export function clearSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
