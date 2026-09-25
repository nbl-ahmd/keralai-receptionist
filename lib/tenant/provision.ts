/**
 * lib/tenant/provision.ts
 *
 * Tenant provisioning for newly authenticated users.
 *
 * Called from the Better Auth `user.create.after` hook. A new user gets a fresh
 * tenant with role `owner`. The single pre-existing installation is represented
 * by the "legacy" tenant, which a trusted email (LEGACY_TENANT_CLAIM_EMAIL) may
 * claim exactly once.
 *
 * Server-only.
 */

import { query, queryOne } from "@/db/client";
import type { TenantRole } from "./types";

export interface ProvisionResult {
  tenantId: string;
  role: TenantRole;
  claimedLegacy: boolean;
}

const LEGACY_SLUG = "legacy";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function displayName(user: { email?: string | null; name?: string | null }): string {
  const name = (user.name ?? "").trim();
  if (name) return name.slice(0, 80);
  const email = (user.email ?? "").trim();
  if (email) return email.split("@")[0].slice(0, 80);
  return "My workspace";
}

async function uniqueTenantSlug(base: string): Promise<string> {
  const root = slugify(base) || "workspace";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt}`;
    const existing = await queryOne<{ id: string }>("select id from tenants where slug = $1", [
      candidate,
    ]);
    if (!existing) return candidate;
  }
  return `${root}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Creates the default company profile + runtime-state rows for a tenant. */
async function seedTenantRows(tenantId: string): Promise<void> {
  await query(
    `insert into company_profile (tenant_id) values ($1) on conflict (tenant_id) do nothing`,
    [tenantId],
  );
  await query(
    `insert into tenant_runtime_state (tenant_id, mode) values ($1, 'available')
     on conflict (tenant_id) do nothing`,
    [tenantId],
  );
}

/**
 * Claims the legacy tenant for `userId` if it has not already been claimed.
 * Returns null when unavailable (already claimed or missing).
 */
export async function claimLegacyTenant(userId: string): Promise<ProvisionResult | null> {
  const legacy = await queryOne<{ id: string }>(
    `select id from tenants where is_legacy = true order by created_at limit 1`,
  );
  if (!legacy) return null;

  const claimed = await query<{ tenant_id: string }>(
    `insert into legacy_tenant_claims (tenant_id, user_id) values ($1, $2)
     on conflict (tenant_id) do nothing
     returning tenant_id`,
    [legacy.id, userId],
  );
  if (!claimed[0]) return null;

  await query(
    `insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')
     on conflict (tenant_id, user_id) do nothing`,
    [legacy.id, userId],
  );
  return { tenantId: legacy.id, role: "owner", claimedLegacy: true };
}

/**
 * Idempotently provisions tenant access for a user. Safe to call repeatedly:
 * if the user already has a membership, that membership is returned.
 *
 * A new user ALWAYS receives a fresh tenant, even when their email matches
 * LEGACY_TENANT_CLAIM_EMAIL. The legacy workspace is never claimed implicitly
 * from the signup hook — it can only be claimed through the explicit,
 * token-gated /api/tenant/claim-legacy endpoint. This prevents an attacker who
 * merely registers with the owner's (possibly unverified) email address from
 * inheriting the migrated single-tenant data.
 */
export async function provisionTenantForUser(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): Promise<ProvisionResult> {
  const existing = await queryOne<{ tenant_id: string; role: string }>(
    `select tenant_id, role from tenant_memberships
      where user_id = $1 order by created_at limit 1`,
    [user.id],
  );
  if (existing) {
    return {
      tenantId: existing.tenant_id,
      role: existing.role as TenantRole,
      claimedLegacy: false,
    };
  }

  const slug = await uniqueTenantSlug(displayName(user));
  const tenant = await queryOne<{ id: string }>(
    `insert into tenants (name, slug, is_legacy) values ($1, $2, false) returning id`,
    [displayName(user), slug],
  );
  if (!tenant) throw new Error("Failed to create tenant");

  await query(
    `insert into tenant_memberships (tenant_id, user_id, role) values ($1, $2, 'owner')
     on conflict (tenant_id, user_id) do nothing`,
    [tenant.id, user.id],
  );
  await seedTenantRows(tenant.id);

  return { tenantId: tenant.id, role: "owner", claimedLegacy: false };
}

export { LEGACY_SLUG };
