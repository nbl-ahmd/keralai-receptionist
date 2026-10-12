# Closed Alpha funding

KeralAI's operator funds the Vobiz parent account and dedicated Gemini project.
Testers receive sponsored KeralAI testing credit. They never pay Vobiz directly.
Public signup and customer payments remain disabled. Credit is a non-cash testing
allowance, not a customer deposit or a withdrawal/refund entitlement.

Every invited Alpha tenant starts without phone activation approval. A platform
operator can grant `phone_approval` with a reason and unique reference using the
existing Alpha admin controls. This authorizes future activation only. Revocation
never releases an owned number or removes immutable charges. Independent purchase,
voice, subscription and provider readiness gates remain authoritative.

Before activation the server refreshes inventory and KYC, checks approved DID
setup/monthly/commitment ceilings, verified account-specific release pricing and
a fresh parent INR balance. Missing costs/restrictions fail closed. The published
inventory contract does not guarantee account-specific release fees. Observed
runtime release quotes can only increase the conservative reservation.
`ALPHA_DID_RELEASE_COST_MINOR` must be confirmed
from the account's pricing, never copied from documentation examples.

The platform row serializes wallet and provider exposure reservations. Setup plus
at least one rental month (or the full minimum commitment) plus release exposure
is conservatively reserved for every owned/uncertain DID alongside carrier session
exposure. This reservation remains while owned; it is a safety estimate, not a
provider invoice. Released numbers retain exposure for their creation or release month.
Legacy DIDs without an exposure snapshot require operator review before further
provider spending. No existing billing ledger row is rewritten. New activation
captures setup and initial rental separately with deterministic idempotency keys.

Configuration (INR paise unless otherwise indicated):

- `ALPHA_MAX_DID_SETUP_COST_MINOR`, `ALPHA_MAX_DID_MONTHLY_COST_MINOR`
- `ALPHA_DID_RELEASE_COST_MINOR`, `ALPHA_MAX_DID_RELEASE_COST_MINOR`
- `ALPHA_MAX_DID_COMMITMENT_MONTHS` (integer months)
- `ALPHA_MIN_VOBIZ_BALANCE_MINOR`

Leave values empty until approved. Number availability alone does not authorize
purchase. Provider balance is checked only for new activation, never as a stale
condition for interrupting an already accepted inbound call.
