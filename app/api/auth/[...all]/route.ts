/**
 * app/api/auth/[...all]/route.ts
 *
 * Better Auth catch-all handler (sign-up, sign-in, sign-out, session, …).
 * Node runtime: the auth adapter uses a `pg` Pool.
 */

import { handleAuthRequest } from "@/lib/auth/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleAuthRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleAuthRequest(request);
}
