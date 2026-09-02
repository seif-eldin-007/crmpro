import { NextResponse, type NextRequest } from "next/server";
import { SESSION_HINT_COOKIE } from "@/lib/session-hint";

/**
 * Early auth gate (Next.js `proxy` file convention, formerly `middleware`).
 *
 * Redirects unauthenticated hits on protected routes to /login before any client
 * JS loads, so deep links never flash the protected shell. It reads the
 * non-httpOnly session-hint cookie because the real refresh cookie is scoped to
 * `/api/v1/auth` and is not visible here. The client guard in the protected
 * layout stays the authority for actual session validity and permissions.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_HINT_COOKIE)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Everything except Next internals, the API rewrite proxy, public pages and static assets.
  matcher: [
    "/((?!_next/|api/|login|403|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp3|txt)$).*)",
  ],
};
