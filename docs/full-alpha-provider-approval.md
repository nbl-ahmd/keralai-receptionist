# Next provider approval — Phase D

Status as of 2026-10-12: approved and executed for one disposable account.
Mock validation is blocked by provider HTTP 404; it did not pass. See
[the current evidence](./phone-alpha-provider-blockers.md). Do not recreate or replay it.
The commands below preserve the original preparation procedure.
This action creates real disposable provider records using synthetic KYC only.
It attaches no DID, purchases/releases nothing and submits no real PAN/Aadhaar.
It does not activate readiness or deploy anything.

The pending approval is limited to creating one new customer_use/individual
subaccount under the configured parent and running official mock verification.
The existing operator's sign-in email is resolved server-side from the user-ID
allowlist. The creation body is:

```json
{
  "name": "KeralAI disposable mock KYC",
  "email": "<resolved existing operator email>",
  "kyc_mode": "customer_use",
  "business_type": "individual",
  "enabled": true,
  "permissions": { "calls": false, "cdr": true }
}
```

After approval, from the repository root:

```sh
VOBIZ_KYC_TEST_CREATE_APPROVED=1 node scripts/prepare-vobiz-kyc-test.mjs --create
node scripts/prepare-vobiz-kyc-test.mjs --test-prepared
```

The first command parent-authenticates a single POST to
`/api/v1/accounts/{MA}/sub-accounts/`. It records a durable local intent before
sending and refuses to create another account if that intent exists. Returned
credentials are discarded, never logged or persisted. The ignored record keeps
only the disposable identifier and purpose/time/state. A timeout requires
read-only parent-list recovery, never another speculative POST.

The second command invokes the existing guarded `test-vobiz-kyc.mjs` against
that fresh disposable identifier. It verifies customer_use/individual,
not_started and calls blocked, then exercises failed/pending/finalize-failed/
verified mock PAN and synthetic DigiLocker. Status GETs remain authoritative.
A tested record cannot be replayed through this wrapper. Mock verification is
never accepted as lawful KYC for a real carrier number. Keep this account
separate from real testers and never attach a DID.

Real hosted PAN/DigiLocker requires a distinct operator-controlled account and
separate approval/operator execution. Open KeralAI Phone only after browser
voice acceptance; complete the hosted provider page yourself. KeralAI must not
receive identity documents in chat, logs or test fixtures. Do not proceed to a
paid DID until Phase D passes and current pricing, callback evidence, exact
number, commitment/release exposure and purchase budget are approved.

Later paid number/Application/carrier actions are separately governed by the
[existing live sign-off procedure](./live-vobiz-signoff.md). No existing
parent-owned DID may be reused or changed without its operator's permission.
