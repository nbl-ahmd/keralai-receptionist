/**
 * lib/tenant/types.ts
 *
 * Shared tenant primitives. Kept free of server-only imports so both server and
 * client components can use the role/context types.
 */

export type TenantRole = "owner" | "admin" | "member";

export const TENANT_ROLES: TenantRole[] = ["owner", "admin", "member"];

/** Resolved, trusted tenant identity for a request. Never built from client input. */
export interface TenantContext {
  userId: string;
  tenantId: string;
  role: TenantRole;
}

export interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  role: TenantRole;
  isLegacy: boolean;
}

export const ROLE_RANK: Record<TenantRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export function hasRole(role: TenantRole, allowed: TenantRole[]): boolean {
  return allowed.includes(role);
}
