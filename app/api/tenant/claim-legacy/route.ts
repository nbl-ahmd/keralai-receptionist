import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { claimLegacyTenant } from "@/lib/tenant/provision";
import { handleApiError, requireUserId, listTenantsForUser } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

/** Constant-time string comparison that never throws on length mismatch. */
function secureEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * One-time claim of the pre-multitenancy "legacy" tenant by a trusted owner.
 *
 * Guarded three ways:
 *   1. The authenticated user's email must match LEGACY_TENANT_CLAIM_EMAIL.
 *   2. The request must present LEGACY_TENANT_CLAIM_TOKEN (a server-only secret,
 *      compared in constant time) — possession of the secret is what proves the
 *      caller is the operator, not merely someone who registered the email.
 *   3. The claim ledger allows the legacy tenant to be claimed only once.
 *
 * New users are unaffected — they already own a fresh tenant, and the signup
 * hook never claims the legacy tenant implicitly.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUserId(request);

    const claimEmail = (process.env.LEGACY_TENANT_CLAIM_EMAIL ?? "").trim().toLowerCase();
    const email = (user.email ?? "").trim().toLowerCase();
    if (!claimEmail || !email || email !== claimEmail) {
      return NextResponse.json({ error: 'Legacy data is not available for this account' }, { status: 403 });
    }

    const claimToken = (process.env.LEGACY_TENANT_CLAIM_TOKEN ?? "").trim();
    if (!claimToken) {
      return NextResponse.json(
        { error: "Legacy claiming is disabled. Set LEGACY_TENANT_CLAIM_TOKEN to enable it." },
        { status: 403 },
      );
    }

    // Optional extra hardening: reject unverified accounts when the operator
    // has enabled email verification (V1 does not require it).
    if (
      process.env.LEGACY_TENANT_CLAIM_REQUIRE_VERIFIED_EMAIL === "1" &&
      !user.emailVerified
    ) {
      return NextResponse.json(
        { error: "Verify your email address before claiming legacy data" },
        { status: 403 },
      );
    }

    let provided = "";
    try {
      const body = (await request.json()) as { token?: unknown };
      provided = typeof body?.token === "string" ? body.token.trim() : "";
    } catch {
      /* no/invalid JSON body — treated as a missing token */
    }
    if (!provided || !secureEqual(provided, claimToken)) {
      return NextResponse.json({ error: "Invalid claim token" }, { status: 403 });
    }

    const result = await claimLegacyTenant(user.id);
    if (!result) {
      return NextResponse.json({ error: 'Legacy data has already been claimed' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      tenantId: result.tenantId,
      role: result.role,
      tenants: await listTenantsForUser(user.id),
    });
  } catch (error) {
    return handleApiError(error, 'Failed to claim legacy data');
  }
}
