# KeralAI balance and usage

Customer balance belongs to KeralAI. Vobiz purchases/calls charge the platform's parent provider balance. A customer never tops up Vobiz directly.

`wallet_transactions` is the financial source of truth: integer INR paise, append-only PostgreSQL trigger, tenant/reference metadata and unique `(tenant_id,idempotency_key)`. No mutable balance column is authoritative. Balance is the sum of ledger entries. Spendable balance subtracts reserved phone holds and pending call budgets. `wallet_accounts.status` can block spending.

## Charges

- Number activation reserves configured setup fee plus the first rental. Capture happens only after verified routing; initial debit key is `number:{UUID}:initial`.
- Rental is a fixed configured customer monthly amount every 30 days; key includes number ID and due timestamp. Insufficient spendable balance suspends the DID and leaves the due period outstanding. Operator resume requires rental reconciliation and positive available balance.
- A phone WebSocket claims a single call budget under the wallet lock, capped at 60 minutes. Concurrent calls cannot spend the same reservation. The bridge stops within its reserved allowance with a 30-second buffer.
- A signed hangup or scheduled job fetches completed provider CDR. From/To/direction/account/currency must match the tenant usage row. Customer charge is `ceil(billsec / 60) × rate_per_minute_minor`, with the rate snapshotted at answer. Zero billable seconds costs zero. Ledger key `call:vobiz:{UUID}` prevents duplicate debit. Wallet and usage update atomically; reservation stops counting after `billing_status=charged`.
- Provider decimal cost is stored separately for reconciliation. AI/platform cost fields are reserved for later measured cost reporting; they are not fabricated or used as customer charges.

A pending call holds its budget until authoritative CDR is available. WebSocket disconnect alone never invents final duration/cost. Monitor pending usage and resolve disputed/missing CDRs. Exceptional provider timing can still exceed a reservation; the authoritative CDR debit can produce negative balance and blocks future service. There is no silent charge truncation.

## Credits and payments

There is no live payment gateway. Balance UI clearly states online payments are unavailable and invites contact for beta credit. Allowlisted admins can add an audited `adjustment` with `reference_type=beta_credit`; the same reference cannot be credited twice or reused for a different amount. It is not a claim of a successful payment. Refund/adjustment transaction types are available for an operator service, but historical entries cannot be modified/deleted.

Before public paid signup, integrate Razorpay/UPI with verified server payment webhooks, immutable top-up keys, settlement/refund reconciliation and explicit taxes/pricing terms. Do not credit from a client-side success page. Configure all prices explicitly; the code has no default customer prices. Zero/malformed price configuration fails closed.
