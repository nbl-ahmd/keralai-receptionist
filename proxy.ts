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


export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get("better-auth.session_token")?.value || request.cookies.get("__Secure-better-auth.session_token")?.value);

  // Unauthenticated users cannot reach the dashboard.
  if (!hasSession && (pathname.startsWith("/dashboard") || pathname === '/admin' || pathname.startsWith('/admin/'))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  const headers=new Headers(request.headers);
  headers.set('x-keralai-pathname',pathname);
  return NextResponse.next({request:{headers}});
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/login", "/register"],
};
