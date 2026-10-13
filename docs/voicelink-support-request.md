# VoiceLink support request — prepared, not sent

Subject: Contracts needed for secure reseller/client WebSocket calling and recovery

We are integrating our own Gemini voice assistant through VoiceLink's WebSocket
transport, with one isolated provider client per application tenant. We are using
`https://app.voicelink.co.in/api/v1` and server-side Bearer authentication.

On 13 October 2026, `/reseller/profile` returned 200 in the official playground
and our deployed Vercel app. The inventory GET also returned 200 in the playground; its live numeric DID/country-code shape differs from the documented string example and is now handled in our proposed patch. Vercel's resource table confirms the profile/inventory
functions run in BOM1. Earlier IAD1 requests timed out; local DNS/TLS and an
unauthenticated profile GET now succeed (401 as expected). Please confirm any
hosting-region, outbound-IP or API access restrictions; we have not established
the earlier timeout's root cause.

Please provide the following authoritative contracts:

1. Authentication for WSS handshakes and HTTP callbacks: supported headers,
   signatures/secrets, canonical payload, timestamps/nonces, key rotation and
   retries. Bot creation documents URLs but no authentication fields. What
   authenticated pre-answer event supplies a call-scoped streaming credential?
2. Live call lookup: whether `/call-log/details?call_id=...` is authoritative
   during a call, availability delay, definitive live/completed states, and
   exact reseller/client/DID identity. The example CDR has `talk_duration`,
   `call_duration`, timezone-less timestamps and `total_cost`; specify billable
   duration, timezone, pulse rounding, zero-duration charging, finality and
   whether bot/account SID equals the client ID. Provide carrier hangup and
   maximum billable-duration controls, including disconnect and timeout behavior.
3. Media: API configuration for A-law/mu-law/PCM, rate/channel count, outbound
   frames, whether returned `mark` means audio playback completed, and whether
   `clear` generates acknowledgments. Is stream closure guaranteed to terminate
   every carrier leg? How are outbound lead failures correlated with final CDRs?
4. Trial Pack (`plan_type=free`, prepaid): the operator has created a client in
   the portal with allocated capacity. Please confirm which API plan/rate fields
   apply to trial client creation. Can capacity be pooled across clients or must each have >=1 dedicated
   channel? Does the first-purchase DID+channel requirement apply when capacity
   already exists? Explain client funding with wallet bypass off and controls
   that prevent client portal spending from unbounded reseller funds.
5. Recovery: idempotency/correlation for create-client, lock-DID, confirm,
   map-DID, renew and release; authoritative draft/purchase lookup and cancellation
   after a lost response. Does omitting `order_id` always create an independent
   draft? Give lock expiry timezone/TTL and purchase-history lookup by order ID.
6. Commercial/eligibility: confirm one-month minimum, any longer commitments,
   mandatory API auto-renew versus manual renewal-toggle docs, DID/channel release
   fees/cooldown/refunds, tax treatment (manual says taxes apply on wallet recharge),
   and final rental/usage rates for our plan. Confirm individual PAN/Aadhaar and
   business KYC for reseller/client accounts and whether personal assistants and
   business receptionists may both use individual KYC; clarify required photo,
   location, document-upload and agreement steps in hosted KYC.

Please supply endpoint schemas and sanitized examples. We will not activate
calling or purchase resources until the security and commercial contracts are
confirmed and tested. No credentials or identity documents are attached.
