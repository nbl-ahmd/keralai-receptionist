# VoiceLink integration preparation

Reviewed on 2026-10-12. Vobiz remains the only live managed provider adapter.
VoiceLink is a separate selectable setup at `/dashboard/phone?provider=voicelink`.
Selection is URL-based and changes only the setup view, not tenant provisioning,
existing numbers, routing, billing or provider ownership. The default remains Vobiz.

## Implemented

- Provider chooser and separate authenticated VoiceLink readiness/pricing endpoint.
- VoiceLink-specific G.711 A-law codec and JSON media transport, tested with known
  codec vectors, wrong-account/call rejection, playback and interruption fixtures.
- Explicit VoiceLink requests on existing telephony APIs fail with 503 before any
  Vobiz operation; unknown provider requests fail with 400. No silent fallback.
- Optional operator-entered rate card, clearly labelled as a quote/estimate.
- No database migration, provider account, identity submission, purchase, callback
  configuration or deployment is performed by this change.

The media transport is intentionally **not mounted** on `/ws/voicelink`. Its start
metadata checks are not provider authentication. Public activation requires an
authoritative admission path, wallet reservation, owned DID, provider KYC gate,
authenticated callbacks and CDR reconciliation. Neither a provider-supplied
tenant ID nor a local `verified` checkbox can substitute for those checks.
No environment flag can turn this preparation into a live adapter.

## Contracts still required

VoiceLink's public manuals describe portal features and call event formats, but
do not publish the authenticated REST contracts needed to implement:

1. Client creation/idempotency and secure credential handling.
2. Hosted KYC session creation and authoritative account verification/call gate.
3. Inventory with DID **and channel** pricing, purchase and uncertainty recovery.
4. Number ownership, bot/routing assignment and read-back verification.
5. WebSocket authentication, signed webhook verification and replay protection.
6. Live call identity, authenticated hangup, completed CDR and carrier charge.
7. Release/renewal semantics, commitments, fees and channel sharing.

Ask for the API documentation/OpenAPI from the reseller portal after signup.
Keep PAN/Aadhaar files in VoiceLink's hosted flow, outside this application.
Once these contracts are available, implement `TelephonyProvider` and update
orchestration, inbound admission, bridge token/provider claims, reconciliation,
operator readiness and accounting together. Do not just mount the media adapter.
Existing hard-coded Vobiz callback paths and provider-specific policy need explicit
dispatch; they cannot safely serve VoiceLink unchanged.

## Pricing research

The supplied marketing sitemap and public reseller/client manuals did not expose
a numeric rate card. Actual rental, channel and usage amounts remain unknown.
The public purchase manual says the first purchase includes a DID plus a channel;
one channel is one simultaneous call. DIDs are billed for a full month, channels
are initially prorated, minimum duration is one month and auto-renewal defaults on.
Taxes are charged at wallet recharge. Failed renewal with insufficient balance
requires recharge/manual renewal; eventual number retention/release needs confirmation.

The public client plan manual describes per-second usage and unlimited plans with
predefined limits/possible excess charges. Get the exact pulse, fair-use allowance,
setup/release fees, minimum recharge, reseller-plan fee and channel pooling in writing.
CPS limits call starts per second; it does not establish simultaneous capacity.
Some unlimited-channel documentation conflates CPS and concurrency; obtain the
actual concurrency ceiling and fair-use policy for the selected plan.

Optional app-server variables (all amounts are INR **paise**, never rupees):

```dotenv
# Only fill with a real written account-specific quote; no default rates.
VOICELINK_QUOTE_REFERENCE=
VOICELINK_NUMBER_MONTHLY_MINOR=
VOICELINK_CHANNEL_MONTHLY_MINOR=
VOICELINK_INBOUND_MINUTE_MINOR=
VOICELINK_OUTBOUND_MINUTE_MINOR=
```

All fields are required to show an estimate. An explicitly quoted zero is allowed;
missing, fractional, negative, oversized or malformed fields produce "quote required".
The estimate includes one DID + one channel + incoming billed minutes, excluding
taxes, setup, release, commitments, additional call legs, AI and hosting. It is not
a purchase price or billing authority and has no effect on the wallet ledger.
Do not put VoiceLink credentials in `NEXT_PUBLIC_*` variables or chat.

## Audio contract discrepancy

The event reference specifies `audio/alaw`, 8 kHz, with `start`, bidirectional
`media`, `mark`, `clear` and inbound `stop`; it also describes a transfer command.
The overview inconsistently describes raw SLIN/linear PCM and A-law. The media
adapter follows the specific A-law event schema. Confirm a real sample with
VoiceLink before acceptance. A-law differs from Vobiz's mu-law; neither is a WAV file.
Mark acknowledgement/playback-drain semantics also need live validation.
WebSocket closure alone never proves PSTN hangup or completed billing.

## Primary references

- [Reseller KYC](https://app.voicelink.co.in/documentation/login-kyc/)
- [Client KYC](https://app.voicelink.co.in/documentation/login-kyc-2/)
- [Client management](https://app.voicelink.co.in/documentation/client-management/)
- [WebSocket bot configuration](https://app.voicelink.co.in/documentation/websocket-bots/)
- [Audio overview](https://app.voicelink.co.in/documentation/overview/)
- [Event schemas](https://app.voicelink.co.in/documentation/websocket-events/)
- [Webhooks](https://app.voicelink.co.in/documentation/webhook/)
- [Purchases](https://app.voicelink.co.in/documentation/buy-phone-numbers-channels/)
- [Reseller plans](https://app.voicelink.co.in/documentation/my-plan/)
- [Client plans](https://app.voicelink.co.in/documentation/plans/)
- [API/white-label FAQ](https://app.voicelink.co.in/documentation/faqs/)
- [Marketing sitemap](https://voicelink.co.in/sitemap_index.xml)
