/**
 * lib/auth/context.ts
 *
 * Request authentication + tenant resolution for API routes.
 *
 * Tenant context is NEVER taken from client input alone. It is resolved from the
 * authenticated Better Auth session plus a validated `tenant_memberships` row.
 * A client may *hint* which tenant it wants (for future multi-tenant switching)
 * via the `x-tenant-id` header, but that hint is only honoured when the
 * authenticated user actually holds a membership in it.
 *
 * Server-only.
 */

import { NextResponse } from "next/server";
import { getAuth } from "./server";
import { provisionTenantForUser } from "../tenant/provision";
import { query } from "@/db/client";
import type { TenantContext, TenantRole, TenantSummary } from "../tenant/types";
import { hasRole, ROLE_RANK } from "../tenant/types";

/** Thrown by helpers below; converted to a JSON response by handleApiError(). */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export interface SessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

/** Returns the authenticated Better Auth session, or null. */
export async function getSession(request: Request): Promise<{
  user: SessionUser;
  session: { id: string; userId: string; expiresAt: Date };
} | null> {
  try {
    const result = await getAuth().api.getSession({ headers: request.headers });
    if (!result?.user?.id) return null;
    return {
      user: {
        id: result.user.id,
        email: result.user.email ?? null,
        name: result.user.name ?? null,
      },
      session: {
        id: result.session.id,
        userId: result.session.userId,
        expiresAt: result.session.expiresAt,
      },
    };
  } catch (error) {
    // A malformed/absent DB should not be reported as a 500 auth failure here.
    console.error("[auth] getSession failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Requires an authenticated user; throws HttpError(401) otherwise. */
export async function requireUserId(request: Request): Promise<SessionUser> {
  const session = await getSession(request);
  if (!session) throw new HttpError(401, "Authentication required");
  return session.user;
}

interface MembershipRow {
  tenant_id: string;
  role: string;
  name: string | null;
  slug: string | null;
  is_legacy: boolean | null;
}

function pickMembership(rows: MembershipRow[], hint: string | null): MembershipRow {
  if (hint) {
    const match = rows.find((row) => row.tenant_id === hint);
    if (match) return match;
  }
  // Prefer the claimed legacy workspace (it holds the pre-multitenancy data the
  // trusted owner migrated), then highest role, then oldest membership.
  return [...rows].sort((a, b) => {
    const legacy = Number(Boolean(b.is_legacy)) - Number(Boolean(a.is_legacy));
    if (legacy !== 0) return legacy;
    return (ROLE_RANK[b.role as TenantRole] ?? 0) - (ROLE_RANK[a.role as TenantRole] ?? 0);
  })[0];
}

/**
 * Resolves the trusted tenant context for a request.
 *
 * Self-heals a missing membership by provisioning the user's tenant (the signup
 * hook can fail without failing signup, so the first request repairs it).
 */
export async function resolveTenantContext(
  request: Request,
  options: { roles?: TenantRole[] } = {},
): Promise<TenantContext> {
  const user = await requireUserId(request);

  let memberships = await loadMemberships(user.id);

  if (memberships.length === 0) {
    await provisionTenantForUser(user);
    memberships = await loadMemberships(user.id);
  }

  if (memberships.length === 0) {
    throw new HttpError(403, "No workspace is available for this account");
  }

  const hint = request.headers.get("x-tenant-id");
  const membership = pickMembership(memberships, hint);
  const role = membership.role as TenantRole;

  if (options.roles && !hasRole(role, options.roles)) {
    throw new HttpError(403, "You do not have permission to perform this action");
  }

  return { userId: user.id, tenantId: membership.tenant_id, role };
}

async function loadMemberships(userId: string): Promise<MembershipRow[]> {
  return query<MembershipRow>(
    `select m.tenant_id, m.role, t.name, t.slug, t.is_legacy
       from tenant_memberships m
       join tenants t on t.id = m.tenant_id
      where m.user_id = $1
      order by m.created_at`,
    [userId],
  );
}

/** Tenant summaries for the signed-in user (used by the workspace switcher). */
export async function listTenantsForUser(userId: string): Promise<TenantSummary[]> {
  const rows = await loadMemberships(userId);
  return rows.map((row) => ({
    id: row.tenant_id,
    name: row.name ?? "Workspace",
    slug: row.slug ?? "",
    role: row.role as TenantRole,
    isLegacy: Boolean(row.is_legacy),
  }));
}

/**
 * Resolves the active tenant plus the full list of tenants the user can switch
 * between. Used by /api/tenant.
 */
export async function resolveTenantWithList(request: Request): Promise<{
  context: TenantContext;
  tenants: TenantSummary[];
}> {
  const user = await requireUserId(request);

  let memberships = await loadMemberships(user.id);
  if (memberships.length === 0) {
    await provisionTenantForUser(user);
    memberships = await loadMemberships(user.id);
  }
  if (memberships.length === 0) {
    throw new HttpError(403, "No workspace is available for this account");
  }

  const hint = request.headers.get("x-tenant-id");
  const membership = pickMembership(memberships, hint);

  const tenants: TenantSummary[] = memberships.map((row) => ({
    id: row.tenant_id,
    name: row.name ?? "Workspace",
    slug: row.slug ?? "",
    role: row.role as TenantRole,
    isLegacy: Boolean(row.is_legacy),
  }));

  return {
    context: {
      userId: user.id,
      tenantId: membership.tenant_id,
      role: membership.role as TenantRole,
    },
    tenants,
  };
}

/** Loads a single tenant row. Returns null when it does not exist. */
export async function getTenant(
  tenantId: string,
): Promise<{ id: string; name: string; slug: string; isLegacy: boolean } | null> {
  const rows = await query<{ id: string; name: string; slug: string; is_legacy: boolean }>(
    `select id, name, slug, is_legacy from tenants where id = $1`,
    [tenantId],
  );
  const row = rows[0];
  return row ? { id: row.id, name: row.name, slug: row.slug, isLegacy: row.is_legacy } : null;
}

/**
 * Converts thrown errors to safe JSON responses. Unknown errors never leak
 * database or secret detail in production.
 */
export function handleApiError(error: unknown, fallback = "Request failed"): NextResponse {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[api] Unhandled error:", error instanceof Error ? error.message : error);
  const message =
    process.env.NODE_ENV === "development" && error instanceof Error
      ? error.message
      : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
