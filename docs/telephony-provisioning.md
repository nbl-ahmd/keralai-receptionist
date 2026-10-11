# Phone provisioning and recovery

New users configure an assistant, optionally add knowledge and test browser voice, then request a phone number. A server-authenticated owner/admin creates exactly one `customer_use` / `individual` provider account. The provider token returned once is encrypted with the tenant secret infrastructure. An uncertain account-creation result becomes `needs_review`; the service never creates a second account blindly. Operators must recover provider account credentials securely or confirm absence before a repair; customers cannot supply or adopt arbitrary SA IDs.

## Provisioning sequence

1. Poll authoritative KYC; require active tenant/account and `kyc_calls_blocked=false`.
2. Search real Indian INR voice inventory; validate the selected E.164 against the provider again on purchase.
3. Validate HTTPS callback configuration, signature readiness, bridge settings, tenant AI credentials and explicit commercial prices. No configured AI key means no hold/provider spending.
4. Lock the tenant operation and wallet; reserve the setup plus first 30-day rental as a hold. Unique unreleased DID per tenant prevents purchases with different double-submit keys.
5. Purchase once using the tenant SA credential. Save the real provider number ID.
6. Create an application with answer and hangup callbacks, persist its ID, attach it to the DID, and read owned inventory to verify the binding.
7. Recheck KYC/tenant state. Atomically capture the hold, append the rental debit, and mark active.

Customer APIs: `/api/telephony/account`, `/kyc`, `/kyc/session`, `/numbers`, `/numbers/search`, `/numbers/purchase`, `/numbers/retry`, `/numbers/release`, `/usage`; wallet is `/api/wallet`. Purchase requires an `Idempotency-Key` of 16–100 safe characters. Other number actions require owned UUIDs. Mutations require owner/admin and same-origin requests. Limits are shared per tenant/path: six mutations/minute, sixty reads/minute.

## Failure states

| State | Meaning | Recovery |
| --- | --- | --- |
| `purchasing` / `purchase_unknown` | Remote debit may have succeeded | List SA-owned inventory; never reissue purchase. Keep the hold until confirmed or support resolves it. |
| `purchased` / `configuring` | DID owned, activation incomplete | Resume application/binding/configuration and fresh KYC checks. |
| `configuration_failed` | Reserved DID cannot yet route safely | Retry setup; no customer debit until activation. |
| `suspended` | Operator/low rental balance blocks inbound | Reconcile rental, ensure positive available balance and fresh KYC, then operator resume. |
| `releasing` / `release_unknown` | Provider release outcome uncertain | Reconcile owned inventory; do not issue another delete blindly. Absence confirms release. |
| `released` | DID returned | Release remaining holds; historical call/ledger rows remain. |

A provider timeout/500 can hide a successful purchase. The hold makes funds unavailable but does not debit the ledger. The UI explains the reservation and retry/support path. Payment success is never simulated.

Application creation with an unknown response may leave an orphan application; retry can create another application but never another DID. Operators should inspect/remove unattached `keralai-{number UUID}` applications after a provider outage. The paid DID and customer ledger remain protected.

`GET /api/jobs/telephony` with the configured Bearer cron secret settles due rentals first so provider outages cannot starve billing, then reconciles bounded batches of pending CDRs, uncertain/configuration states, KYC, release and due rentals. Run every five minutes and alert on failures/backlog. Each invocation stops starting more work after 240 seconds and reports `timeLimited`; the route has a 300-second maximum; at higher traffic move these batches to a durable worker.

Release stops service immediately in KeralAI, confirms provider release, then retains history. Rental is charged every 30 days from activation; release does not automatically refund a consumed rental. Provider-side charges can continue for an owned suspended DID, so monitor parent provider balance and resolve low-balance numbers promptly.

### Standard release cooldown

Provider DELETE starts a paid standard release, normally 24 hours pending and cancellable, rather than immediate disappearance. Local state stays `releasing/release_unknown` (calls blocked) until read-only owned-number reconciliation confirms absence. Do not repeat DELETE or use `immediate=true` to hurry recovery. Cancellation refunds the provider fee during the documented window but does not restore routing; operator must verify and rebind the original application explicitly. A held setup balance stays reserved until confirmed release. Already captured customer ledger entries are never deleted or automatically refunded.
