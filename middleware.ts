/**
 * middleware.ts
 *
 * Edge-safe route guard for the dashboard.
 *
 * Only reads the Better Auth session cookie (no DB access here): a present
 * cookie lets the request through, where the server components/API routes do
 * the real session + tenant validation. This keeps the middleware fast and
 * avoids running a Postgres query on every asset request.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const AUTH_PAGES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  // Signed-in users should not see the login/register pages.
  if (hasSession && AUTH_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Unauthenticated users cannot reach the dashboard.
  if (!hasSession && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
