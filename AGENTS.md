# KeralAI Receptionist — Repository Instructions

## Project

KeralAI Receptionist is a Next.js + Neon Postgres + Node.js WebSocket bridge application.

Architecture:

- Next.js 16 App Router frontend and API routes
- Neon Postgres
- `@neondatabase/serverless` for Next.js database access
- Node.js `pg` for the long-running bridge
- `ws` for WebSocket transport
- `@google/genai` for Gemini Live
- Managed Vobiz for phone audio; Exotel is a deprecated compatibility adapter
- Render for the standalone bridge
- Vercel for the Next.js application

## Primary Goal

Evolve KeralAI into a beta-ready multi-tenant managed AI receptionist / personal-assistant platform while preserving existing functionality.

Each authenticated user must have access only to their tenant data.

## Critical multitenancy invariant

Every tenant-owned database table must contain `tenant_id`.

Every tenant-owned query must constrain by `tenant_id`.

No client-provided tenant ID is trusted.

Tenant context must be resolved from authenticated session + validated membership.

Never use a global singleton company profile.

Default tenant mode uses encrypted per-tenant Gemini keys. Explicit closed-alpha platform mode may use PLATFORM_GEMINI_API_KEY after server-side invitation, active-tenant and daily-allowance checks. This user-authorized mode shares credentials only, never tenant data.

Never use global CRM configuration for tenant requests.

Never use global knowledge, calls, contacts, appointments, messages, or instructions.

## Authentication

Use Neon Auth / managed Better Auth.

Primary authentication:

- email + password

Do not build custom password hashing/session management unless Neon Auth integration absolutely requires an adapter.

Do not add SMS OTP for V1.

Google OAuth may be added later but is not required for the first working implementation.

## Tenant model

Use:

- `tenants`
- `tenant_memberships`

Roles:

- owner
- admin
- member

A newly registered user automatically receives a tenant with role `owner`.

The membership model must be designed so multiple users can later share a tenant.

Do not create a separate Neon database for every tenant.

## Tenant secrets

Tenant provider credentials are stored in `tenant_secrets`.

Secrets must be encrypted at rest with AES-256-GCM.

Master encryption key:

`TENANT_SECRETS_ENCRYPTION_KEY`

Never return decrypted secrets to the browser.

Never log decrypted secrets.

Never log full API keys.

Settings APIs return only:

- configured
- provider
- key name
- masked suffix if useful
- created/updated timestamps

## Providers

V1 provider configuration must support:

- Gemini
- Exotel
- CRM/Webhook
- future provider types without schema rewrites

Gemini must support a tenant-specific API key.

Gemini model selection can be tenant-configurable where useful, but do not expose unsupported Live API models as selectable options without validation.

Exotel credentials may be stored even if the current inbound WebSocket flow does not require REST credentials.

## Exotel tenant routing

The Exotel WebSocket must become tenant-aware.

Preferred shape:

`/ws/exotel/:tenantSlug?token=...`

The token is a per-tenant secret.

Store only a hash of the token.

Provide a tenant settings UI to copy and rotate the URL/token.

Do not expose tenant Gemini credentials in Exotel URLs.

## Browser voice

Authenticated browser sessions must use a short-lived signed bridge token.

Never trust:

`?tenantId=...`

by itself.

Use:

`BRIDGE_AUTH_SECRET`

shared by Vercel and Render.

Bridge token payload should contain:

- user ID
- tenant ID
- scope
- expiration
- random nonce

The bridge must validate signature and expiration before creating a BrowserSession.

## Bridge architecture

Do not create one global:

`new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`

for tenant calls.

Resolve the tenant first.

Resolve the selected credential mode after tenant authorization; decrypt personal keys or validate closed-alpha platform entitlement.

Instantiate the Gemini client for that tenant/session.

The bridge supports explicit closed-alpha platform credentials through bridge/ai-config.mjs and bridge/entitlements.mjs, with fresh tenant configuration, plan/budget and daily allowance checks. Never introduce a silent fallback or a shared Gemini session/profile/history. Keep personal-key mode available and do not overwrite its encrypted keys.

## Runtime modes

Implement tenant-scoped assistant runtime state.

Default modes:

- available
- sleeping
- meeting
- driving
- focus
- do_not_disturb
- lunch
- travelling
- after_hours

Modes may have:

- label
- instruction
- active state
- expires_at

New calls load the current runtime state.

Expired modes must automatically stop applying.

Do not store runtime mode state as ordinary vector knowledge.

Keep existing custom active instructions separate and combine both at call/session initialization.

## Existing active instructions

Preserve the current active-instruction functionality.

Existing instruction rows remain tenant scoped.

Do not embed instructions.

Do not let ordinary knowledge search return instruction rows.

## Database migrations

Never rewrite old migration files.

Add new numbered migrations after the current latest migration.

The migration runner is filename ordered.

Migrations must be:

- transactional
- idempotent where reasonable
- documented
- safe for existing data

Preserve the existing single-tenant data by migrating it into one initial tenant.

Do not silently delete existing calls, knowledge, contacts, appointments, or settings.

## Existing schema migration strategy

The current application uses a singleton `company_profile` and globally scoped tables.

Migrate existing records into a generated legacy tenant.

The first authenticated owner may claim the legacy tenant through an explicit server-side bootstrap mechanism.

After migration, enforce tenant-aware access.

Prevent unrelated users from seeing the legacy data.

If the agent chooses a technically superior compatibility strategy, preserve all existing data and explain the strategy in `docs/multitenancy-architecture.md`.

## API security

Every protected API route must require authentication.

Every protected API route must resolve tenant context.

Every mutation must use the resolved tenant.

Reject unauthorized membership access.

Return:

- 401 for unauthenticated
- 403 for authenticated but unauthorized
- 404 where appropriate to avoid object enumeration

Do not leak database or secret details in production errors.

## Store layer

Refactor `lib/store.ts` so tenant scope is explicit.

Prefer:

`getCalls(tenantId, options)`

over hidden mutable/global tenant context.

All store functions handling tenant-owned data should accept tenant ID.

Audit every function in `lib/store.ts`.

Audit every bridge database function in `bridge/db.mjs`.

## CRM

Current CRM configuration is process-wide.

Refactor CRM configuration to tenant-scoped settings.

CRM sync must use the current tenant's provider configuration.

CRM failures must remain best-effort and must not break live calls.

## Gemini / embeddings

Knowledge embeddings must resolve the selected credential mode after tenant authorization; platform mode requires closed-alpha eligibility.

Knowledge search must always constrain by tenant.

The bridge's `searchKnowledgeEmbeddings()` must take tenant ID.

Never allow a tenant to retrieve another tenant's embeddings.

## Calls

Calls must be tenant scoped.

Contacts must be tenant scoped.

Appointments must be tenant scoped.

Messages must be tenant scoped.

Callback requests must be tenant scoped.

Quote requests must be tenant scoped.

Call metrics must be tenant scoped.

Call transcript rows must be tenant scoped.

Call logs must be tenant scoped.

## IDs and uniqueness

Review existing global unique constraints.

At minimum, tenant-sensitive uniqueness should use composite tenant-aware constraints where appropriate.

Provider call IDs may remain globally unique only when the provider guarantees global uniqueness, otherwise make them tenant scoped.

## Secret logging

Never log:

- Gemini API keys
- Exotel tokens
- CRM secrets
- bridge tokens
- auth session tokens
- encryption keys

Add redaction helpers where useful.

## PWA

Add:

- manifest
- installable icons
- lightweight service worker
- mobile safe areas
- mobile bottom navigation

Do not cache authenticated API responses publicly.

Do not cache WebSocket voice data.

## Mobile UI

All important dashboard functionality must work at:

- 320px
- 360px
- 375px
- 390px
- 414px
- tablet widths
- desktop widths

Minimum interactive target around 44px.

Avoid horizontal overflow.

## UX

Make active assistant status visible on the dashboard.

Provide quick mode controls.

Show current mode and expiration.

Provide one-tap actions for:

- Available
- Meeting
- Driving
- Sleep
- Focus
- DND

Provide custom mode/instruction support.

## Managed beta

Managed telephony and an immutable INR billing ledger are part of this beta.

Prioritize:

- correctness
- tenant isolation
- working authentication
- working voice
- working settings
- usable mobile UX
- easy local setup
- easy Vercel + Render deployment

Keep financial entries append-only, integer minor units, tenant scoped, and idempotent. Never fake payments or provisioning.

Keep customer provisioning simple; preserve the membership model for future teams.

Do not introduce a large ORM migration unless required.

## Testing

Before finishing, test at least:

1. Register user A.
2. Register user B.
3. Confirm A gets tenant A.
4. Confirm B gets tenant B.
5. Put knowledge item X in A.
6. Confirm B cannot retrieve X.
7. Put company profile X in A.
8. Confirm B cannot retrieve X.
9. Save Gemini credential for A.
10. Confirm B cannot retrieve its secret.
11. Activate Meeting for A.
12. Confirm a new A voice session receives Meeting instruction.
13. Confirm B does not receive A's mode.
14. Generate A browser voice token.
15. Confirm tenant B token does not authenticate into A.
16. Test A Exotel bridge URL.
17. Test B Exotel bridge URL.
18. Confirm A call data stays in A.
19. Confirm B call data stays in B.
20. Test unauthenticated API access.
21. Test owner/admin/member authorization.
22. Test mode expiration.
23. Test secret rotation.
24. Test mobile layout.
25. Run build, lint/typecheck, migrations, and relevant tests.

## Commands

Use existing project commands where possible:

`npm run build`

`npm run lint`

`npm run migrate`

`npm run migrate:status`

`npm run dev`

`npm run dev:bridge`

`npm run start:bridge`

Inspect package scripts before adding new commands.

## Coding style

Preserve the current codebase style.

Prefer TypeScript in the Next.js application.

The bridge is JavaScript/ESM and should remain JavaScript unless conversion has a strong justification.

Avoid unnecessary TypeScript migration of the bridge.

Avoid TypeScript generics that add complexity without value.

Do not replace working components just to use a new library.

Do not introduce an ORM solely for convenience.

## Completion requirement

Do not stop after scaffolding.

The final implementation must be wired end to end:

Auth
→ tenant
→ database scope
→ settings
→ secrets
→ bridge routing
→ Gemini
→ calls
→ dashboard
→ modes
→ PWA/mobile.

Run validation and fix errors before declaring completion.

Create or update documentation for all new environment variables and deployment steps.

Do not ask the user to manually finish code wiring that the agent can complete.

## Managed telephony invariants

- Vobiz is the default behind `TelephonyProvider`; keep provider HTTP/codec assumptions in adapters.
- External customers use `customer_use` + `individual`. Never bypass KYC with `personal_use`.
- The final KYC authorization is a provider-confirmed `kyc_calls_blocked === false`.
- Hosted KYC collects documents outside KeralAI. Store states/references only; never PAN/Aadhaar documents.
- Purchase real inventory after server-side validation and a wallet hold. Activate only after verified routing.
- An uncertain provider purchase must be reconciled, never blindly repeated. Preserve recoverable lifecycle states.
- Resolve incoming DID to an internal tenant registry; validate signed provider callbacks and live call metadata.
- Bridge phone tokens are short lived, scope bound, one use, and authorize an owned active number before Gemini.
- Reuse one phone/Gemini session with transport adapters. Keep browser and deprecated Exotel behavior working.
- Deduplicate webhook metadata and usage. Charge each provider call once after authoritative CDR reconciliation.
- Wallet ledger is immutable. Reserve concurrent call budgets; recurring rental uses unique billing-period keys.
- Platform admins come from the server allowlist, never client roles. Audit every operational action.
- Fail closed until real callback signature emission is verified. Do not weaken signatures to make a demo work.
- Use installed Vobiz skills and current official documentation MCP/OpenAPI; document disagreements.
- Validate all ten widths in docs/manual-testing.md. Keep mobile sheets/navigation safe areas and bounded histories.
- Integration tests use disposable schemas on a DIRECT database connection. Never set session search_path on PgBouncer.

Read docs/vobiz-architecture.md, docs/telephony-provisioning.md, docs/kyc-flow.md and docs/billing-architecture.md before changing those workflows.

## Closed alpha invariants

Public signup requires a hashed DB invitation. Account, tenant, Alpha subscription, promo credit and invite redemption commit atomically. Do not reintroduce a shared invitation code, public signup bypass or email allowlist as platform-admin authority. Existing workspaces retain Internal/BYOK; mode switches are explicit and never replace encrypted keys.

Use shared bridge/ai-config.mjs for server credential selection and bridge/entitlements.mjs for plans/admission/one-use claim/rolling guards. Browser voice works before KYC. Phone also requires existing Vobiz signature, live UUID, DID, authoritative KYC and readiness gates. A client boolean cannot grant access. Reserve bounded session usage atomically; phone settlement uses authoritative CDR and an immutable idempotent debit. Unknown provider state retains holds. Estimates are not actual Google/provider prices.

Operator mutation requires server user-ID allowlist, canonical origin, rate/size limits, reason/reference and audit. Never trust tenant role alone. Separate app/bridge env files; process env wins. Never expose provider keys through NEXT_PUBLIC or copy the platform key into tenant secrets. Keep paid APIs, deployment, real KYC and production readiness activation explicit operator actions.
