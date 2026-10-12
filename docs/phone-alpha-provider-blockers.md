# Phone Alpha provider acceptance — 2026-10-12

**Not ready.** Approval covered one disposable synthetic-KYC account and
migrations on the configured development/staging database. No paid DID,
real identity submission, carrier call, deployment or signature activation
was authorized or performed.

## Executed actions and real observations

- Migration 016 applied successfully to the operator-approved database.
- Original disposable creation returned HTTP 409. Parent listing returned 200
  with zero subaccounts; the rejected intent was preserved. The operator then
  approved a unique plus alias. Exactly one disposable customer_use/individual
  account was created with `permissions.calls=false`, no DID and no retained
  credentials. Its restricted identifier remains only in ignored test evidence.
- Status GET returned a live flat response (`auth_id`, `kyc_status`,
  `pan_status`, `aadhaar_status`), unlike the published aggregate contract.
  Parent-owned account GET confirmed individual/customer_use, calls disabled
  and `kyc_calls_blocked=true`.
- The adapter now validates either the published aggregate response or this
  observed flat response. The flat variant requires a fresh authenticated
  account response with matching SA and parent identity, entity/mode and a
  literal provider call gate. It never infers authorization from documents,
  missing fields or redirect success. Masked identity fields are discarded.
- Approved mock PAN POST returned **404** at the officially documented
  `/api/v1/sub-accounts/test/{SA}/kyc/verify-pan`. The test did not pass.
  Read-only adapter validation afterward showed pending, both documents not
  started and calls blocked. No real PAN/Aadhaar was submitted. The intent is
  marked blocked_contract_mismatch to prevent blind replay/recreation.
- Supplied production app and bridge health URLs both returned 200. This is
  reachability evidence, not deployment/version, signature or audio acceptance.
- Read-only inspection of the logged-in Vobiz console confirmed trial account
  status, ₹25 balance, and zero Voice Applications. Its create form exposes
  answer/hangup/fallback URL and method fields, but no dedicated callback-auth
  fields. The form was cancelled without saving. No recharge was performed.
  The console advertises voice numbers from ₹500/month; this is not a quote for
  an eligible inventory item or approval of its setup/release/commitment costs.
- A support clarification was prepared in the console. The operator chose to
  send it personally; no support message was sent. The unsent editor was
  cancelled; the draft below remains available.
  It requests supported synthetic KYC and signature configuration and expressly
  excludes recharge, purchases and activation on the operator's behalf.

## Exact provider clarification draft

This draft has not been sent to anyone. Operator may send it through their
existing Vobiz support channel, adding the restricted account reference privately:

> On 2026-10-12 we created a dedicated customer_use/individual test subaccount
> with calls permission disabled and no DID. Parent-authenticated KYC status GET
> succeeds but returns the flat auth_id/kyc_status/pan_status/aadhaar_status schema,
> without the documented sub_account_id/overall_status/verifications/call gate.
> Parent-owned subaccount GET exposes kyc_calls_blocked=true. The documented
> synthetic PAN POST /api/v1/sub-accounts/test/{SA}/kyc/verify-pan returns HTTP 404.
> Please confirm the supported test-mode endpoint and whether account enablement
> is required. Also confirm the supported Application/console configuration for
> callback URL auth credentials that enables MA-V3 signature headers on answer
> and hangup callbacks. The current Application schema does not describe that
> property. We require signature emission evidence and will not bypass verification.

Primary references checked through official docs MCP:

- https://www.vobiz.ai/docs/sub-accounts/kyc/test-mode
- https://www.vobiz.ai/docs/sub-accounts/kyc/kyc-status
- https://www.vobiz.ai/docs/concepts/validating-callbacks
- https://www.vobiz.ai/docs/applications/create-application

## Approved origins and prepared configuration

The user selected these production origins for read-only validation and future
phone acceptance. Production deployment and paid activation remain unapproved.
Phone origins are prepared locally; local authentication/browser development
settings are preserved. No hosting environment or provider callback was changed.

```text
TELEPHONY_PUBLIC_ORIGIN=https://keralai-receptionist.vercel.app
BRIDGE_PUBLIC_URL=https://keralai-bridge.onrender.com
```

After a separately approved release, hosting configuration must use:

```text
# App
BETTER_AUTH_URL=https://keralai-receptionist.vercel.app
NEXT_PUBLIC_APP_URL=https://keralai-receptionist.vercel.app
TELEPHONY_PUBLIC_ORIGIN=https://keralai-receptionist.vercel.app
BRIDGE_PUBLIC_URL=https://keralai-bridge.onrender.com
NEXT_PUBLIC_BRIDGE_WS_URL=wss://keralai-bridge.onrender.com

# Bridge browser-origin allowlist
PUBLIC_APP_ORIGIN=https://keralai-receptionist.vercel.app
```

The server builds `wss://keralai-bridge.onrender.com/ws/vobiz` with a signed,
short-lived one-use phone token. Use TLS, not ws:// or the generic /ws route.
Browser media remains the separate /ws/browser path. Keep app/bridge signing,
encryption and managed AI keys matched server-side; never paste them into chat.
All signature/phone/purchase gates remain off until actual acceptance.

## Remaining acceptance sequence

1. Resolve the provider contract/test-mode blocker and verify the same disposable
   account safely. Do not buy it a DID or reuse it as real KYC evidence.
2. Approve and deploy the reviewed app/bridge changes separately; verify hosting
   runtime configuration and server secrets. Public signup/payments remain off.
3. Create a distinct explicitly approved real tester account after browser
   completion and operator phone approval. Operator completes hosted PAN and
   DigiLocker personally; poll the authoritative active account/provider gate.
4. Obtain actual signed callback emission evidence using Vobiz's supported
   mechanism. Only the operator may activate attestation after it passes.
5. Approve the specific inventory DID, setup/rental/commitment/release ceilings,
   parent balance floor, sponsored tester credit and maximum provider spend.
   Self-service activation must verify ownership/Application binding.
6. Approve short handset calls for two isolated tenants; check audio, interruption,
   correct tools/knowledge, closure and authoritative CDR settlement exactly once.
7. Complete remaining core-feature and operator/recovery/feedback/monitoring work
   and the full specification validation before inviting the cohort.
