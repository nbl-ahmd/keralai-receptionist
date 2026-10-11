# Alpha architecture

The existing Next.js dashboard/auth/tenant store and standalone Node bridge remain. PostgreSQL holds invites, per-tenant AI mode, plans/subscriptions, global controls, session leases, usage reservations and audit records. There is no new auth stack, billing provider or shared conversation session.

`bridge/ai-config.mjs` is the canonical server-only credential/model selector used by both services. It checks explicit `platform_managed` or `tenant_managed` configuration afresh. A missing selected key fails closed. Platform mode reads only the process key; BYOK decrypts only that tenant's key. Each voice session creates its own Gemini connection/profile/history/tools. Tenant model overrides apply only in BYOK. Environment names are validated, and production processes reject test schemas.

`bridge/entitlements.mjs` is the shared DB authority for feature checks, admission, one-use claims, rolling authorization and closure. App adapters provide its transaction driver. Admission serializes the global control row, subscription and phone wallet, reserves the full bounded session horizon and snapshots plan/version/pricing. The signed 90-second bridge token carries an internal session ID and tenant-scoped claims, never a provider key. The bridge verifies origin/signature/membership/session state and claims once. A duration timer and non-overlapping 30-second checks stop revoked/unavailable sessions independently of client UI. DB failures fail closed.

Invited signup wraps Better Auth's password/session transaction in a connection-bound savepoint inside the invitation transaction. Invite row locking prevents final-use races. Account, workspace/membership/defaults, managed AI mode, Alpha subscription, wallet, one promo ledger entry, redemption and consumption commit together; SDK/provisioning failure rolls back. Original internal provision hooks are excluded for this signup instance. Existing tenants receive additive backfills preserving secrets and Internal/BYOK behavior.

Vobiz signature/live-call/KYC/DID validation remains before phone admission. Answer reserves wallet and quotas before issuing XML. The bridge must claim the matching DID/call reservation. CDR settlement closes pending financial usage idempotently. XML, codec, signed callback verification and provider release semantics are unchanged by the alpha architecture.

Legacy Exotel remains available only for Internal workspaces with the global phone switch enabled. It consumes browser/AI session allowances and uses the duration guard; it is not an Alpha provisioning path or an authoritative Vobiz billing path.

Migrations 012–015 add AI configuration, invitations/plans/subscriptions/audits, session/budget authority and overrides/indexes. 001–011 are retained. Operator APIs check the server user-ID allowlist; tenant owner/admin is insufficient. Tenant-facing usage omits provider costs, audit internals and all credentials.

Current contracts were checked against installed Better Auth code and [database hooks documentation](https://www.better-auth.com/docs/concepts/database), [Google Live usage metadata](https://ai.google.dev/gemini-api/docs/live-guide) and official Vobiz documentation MCP (CDR evidence in ignored `.test-output/alpha-cdr-doc.txt`). Usage metadata is observational and never used as customer call billing authority.
