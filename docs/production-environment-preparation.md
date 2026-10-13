# Hosted closed-Alpha environment preparation — 2026-10-12

The operator approved the existing configured database for hosted closed Alpha.
No hosting settings, provider gates or deployments were changed.

Two private copy files were prepared and validated locally:

- `.env.vercel.local`: copy into Vercel **Production** Environment Variables.
- `bridge/.env.render.local`: copy into Render **Environment**.

These files contain real secrets, are ignored by Git, and have owner-only file
permissions. They are copy artifacts, not runtime dotenv files. Local development
continues to use `.env.local` and `bridge/.env.local` with localhost origins.
Never commit the private copies or paste their contents into chat.

The copies preserve existing auth/signing/encryption/cron/metrics/provider/AI
credentials. Both services match on database, bridge signing key, encryption
key and managed Gemini key. Auth, public metadata and phone callback origins
use `https://keralai-receptionist.vercel.app`; browser voice uses
`wss://keralai-bridge.onrender.com`. Bridge origin admission allows only the
hosted app. Both use `AI_ENVIRONMENT=alpha`, because this hosted release remains
closed Alpha. Render copy sets Node 22 and production runtime; Render supplies
`PORT`. Set Vercel's Node runtime to 22 in project settings.

The missing six DID policy entries were added to the local app env as blanks.
Matching explicit text/live/embedding model defaults were added to both local
files and their hosting copies. Core secrets were not rotated. No test schema,
test database setting, test KYC control, legacy Gemini import key or local port
is included in the hosting copies.

## Confirmed and configured phone values

All ten pricing/policy entries are filled in the private hosting copies and local
files. These settings do not activate paid phone provisioning/admission:

| Variable | Hosting service | Configured value (paise except months) |
| --- | --- | --- |
| `PHONE_MONTHLY_PRICE_MINOR` | App | 60000 (₹600 sponsored monthly) |
| `PHONE_SETUP_PRICE_MINOR` | App | 10000 (₹100 sponsored setup) |
| `CALL_PRICE_PER_MINUTE_MINOR` | App | 42 (₹0.42 sponsored per minute) |
| `PROVIDER_VOICE_RESERVE_MINOR_PER_MINUTE` | Both | 50 (₹0.50 carrier exposure per minute) |
| `ALPHA_MAX_DID_SETUP_COST_MINOR` | App | 10000 (₹100 ceiling) |
| `ALPHA_MAX_DID_MONTHLY_COST_MINOR` | App | 60000 (₹600 ceiling) |
| `ALPHA_DID_RELEASE_COST_MINOR` | App | 70000 (₹700 observed release cost) |
| `ALPHA_MAX_DID_RELEASE_COST_MINOR` | App | 70000 (₹700 ceiling) |
| `ALPHA_MAX_DID_COMMITMENT_MONTHS` | App | 0 months |
| `ALPHA_MIN_VOBIZ_BALANCE_MINOR` | App | 140000 (₹1,400 balance floor) |

Sponsored-credit charges do not enable customer payments. Testers do not pay
Vobiz. The operator funds Vobiz/Gemini. The earlier ₹500 Gemini smoke allowance
does not authorize or determine carrier/DID budgets.

`VOBIZ_CALLBACK_SIGNATURES_VERIFIED`, `PLATFORM_NEW_PHONE_CALLS_ENABLED` and
`PLATFORM_NUMBER_PURCHASE_ENABLED` remain `0` on both services.
The operator requested all available features; `ALPHA_INVITE_ISSUANCE_ENABLED=1`
is now prepared on the app, allowing allowlisted operators to create private
invitations. Public signup still requires a valid invitation. Provider signature
evidence and explicit activation approval are still required; see
[provider blockers](./phone-alpha-provider-blockers.md).

## Validation and hosting checklist

Prepared copies pass shared-value matching, 32-byte encryption decoding,
strong auth/signing/cron/metrics secret checks, HTTPS/WSS origin checks,
absence of public secret names, duplicate-key checks and absence of test settings.
All four files are ignored by Git. Static configuration is not live acceptance.

1. Copy the app file's values to Vercel and the bridge file's values to Render.
   Leave Render's managed `PORT` unset. Preserve existing encrypted data keys.
2. Keep signup invitation-only, phone purchases/calls and provider attestation gated.
3. Ensure the approved hosted database has migrations 001–016. Only migration
   status/application already approved for this database has been performed.
4. Deploy only after separately approving the reviewed application/bridge release.
   `NEXT_PUBLIC_*` changes require a Vercel rebuild, not just a running-process
   restart. Prepared environment values do not deploy the current branch.
5. Check app `/api/health`, bridge `/health`, operator `/dashboard/admin`, and
   authenticated browser audio against the deployed version. No live Gemini
   smoke was run for this env-preparation change.
6. Configure the authenticated telephony reconciliation scheduler with the app's
   existing `CRON_SECRET` when performing the approved phone rollout.
7. Resolve provider KYC/signature blockers, revalidate account pricing and run
   approved real-provider acceptance before enabling phone gates. Browser-only
   invitations do not approve tester phone activation.

## Read-only pricing evidence and operator approval

On 2026-10-12 a parent-authenticated inventory GET returned HTTP 200. The first
five IN quotes expose INR setup fee ₹100, monthly fees ₹500–600, release fee ₹700
and minimum commitment zero months. No DID was bought or reserved. These are
inventory observations, not account-wide future-price guarantees.

The operator confirmed all quoted setup/monthly/release limits, the zero-month
commitment, the ₹1,400 balance floor and sponsored setup/monthly charges. These
were applied without any purchase or call. Current observed ₹25 parent balance
is below the approved floor; recharge remains a separate operator action.

Vobiz's official docs MCP identifies `GET /api/v1/auth/me` as the authenticated
account-details endpoint with assigned `pricing_tier`. The live read-only GET
returned HTTP 200, currency INR, `rate_per_minute=0.38`, billing increment 60
seconds and minimum duration zero. Response credentials/contact fields were
neither logged nor retained. Primary references:
[Retrieve account](https://www.vobiz.ai/docs/account/retrieve-account),
[Account pricing fields](https://www.vobiz.ai/docs/account/account-object).

The operator requested a small KeralAI margin: the sponsored debit is ₹0.42/minute,
about 10.5% above the observed ₹0.38 carrier rate, rounded to whole paise. The
carrier exposure estimate is ₹0.50/minute, providing conservative headroom.
These are closed-Alpha sponsored-credit accounting settings, not payment prices
or a claim to cover Gemini, taxes and every commercial operating expense.
Gemini remains operator funded with its separate configured estimate/budget.
Carrier tariff must be revalidated before real paid acceptance, including any
additional fees. Purchase-time fresh inventory remains authoritative, including
higher release quotes. No callback attestation or paid gate was enabled.
