# KeralAI — Complete Closed Alpha / Full Product Enablement

Repository:

```text
https://github.com/nbl-ahmd/keralai-receptionist
```

Primary current branch:

```text
feat/multitenant-preview
```

Project:

```text
KeralAI
Multi-tenant AI Personal Assistant / AI Receptionist
```

---

# 0. PURPOSE OF THIS PHASE

The previous implementation converted KeralAI from a developer preview into an **invite-only managed-alpha architecture**.

The application already has:

- multi-tenant authentication
- invitations
- Alpha/Internal plans
- platform-managed Gemini
- optional BYOK
- browser voice
- per-tenant quotas
- concurrency controls
- usage reservations
- immutable wallet ledger
- promotional Alpha credits
- global spend controls
- Vobiz provider abstraction
- Vobiz customer-use account support
- Vobiz hosted KYC support
- number inventory
- number provisioning
- Voice Application binding
- secure DID routing
- WebSocket bridge
- CDR reconciliation
- operator/admin controls
- mobile-responsive UI
- tests and smoke infrastructure

The architecture is mostly complete.

This phase is about making the **entire real product journey usable by trusted closed-alpha testers**.

The intended Alpha user is somebody personally invited by the operator who should be able to genuinely experience KeralAI and give product feedback.

---

# 1. TARGET CLOSED-ALPHA EXPERIENCE

A tester should be able to complete:

```text
Private invitation
        ↓
Create account
        ↓
Create personal assistant / receptionist
        ↓
Configure identity, language and behavior
        ↓
Add knowledge
        ↓
Test assistant in browser
        ↓
Open Phone
        ↓
Verify identity
        ↓
PAN + DigiLocker/Aadhaar
        ↓
Choose real Indian number
        ↓
Activate number using sponsored Alpha credit
        ↓
Call number from normal mobile phone
        ↓
KeralAI assistant answers
        ↓
Conversation / tools work
        ↓
Call transcript
        ↓
Summary
        ↓
Messages / callback requests / appointments
        ↓
Usage and Alpha credit update
        ↓
Operator can inspect/support tester
```

The user should NOT need to:

- open Vobiz
- create a Vobiz login
- pay Vobiz directly
- copy Vobiz credentials
- configure SIP
- configure applications
- configure callbacks
- configure WebSockets
- enter a Gemini key
- understand CDRs
- understand provider billing

The complete experience should feel like **KeralAI**, not Vobiz + Gemini configuration exposed through a UI.

---

# 2. FIRST — AUDIT CURRENT BRANCH

Before changing anything:

Read:

```text
AGENTS.md

docs/alpha-architecture.md
docs/alpha-implementation-report.md
docs/alpha-operations.md
docs/alpha-billing.md
docs/live-vobiz-signoff.md
docs/vobiz-architecture.md
docs/telephony-provisioning.md
docs/kyc-flow.md
docs/manual-testing.md
docs/deployment.md
```

Inspect:

```text
migrations 001–015
plans
tenant subscriptions
alpha invitations
wallet ledger
wallet holds
alpha_voice_sessions
telephony accounts
phone_numbers
telephony_usage_events
Vobiz adapter
Vobiz webhook handling
Vobiz Answer URL
bridge tokens
browser voice
bridge entitlement checks
admin pages
Phone UI
onboarding
calls
inbox
appointments
messages
callback requests
knowledge
runtime modes
```

Do not duplicate existing systems.

---

# 3. VOBIZ TOOLING

Use BOTH:

## Official Vobiz Agent Skills

Relevant skills include:

```text
vobiz-sub-accounts
vobiz-partner-api
vobiz-phone-numbers
vobiz-applications-endpoints
vobiz-voice-calls
vobiz-voice-xml
vobiz-audio-streams
vobiz-cdr
```

## Official Vobiz MCP

```text
https://vobiz.ai/docs/mcp
```

Also use:

```text
https://vobiz.ai/docs/llms.txt
```

Current documentation/OpenAPI overrides stale skill examples.

Never invent Vobiz API fields.

---

# 4. ALPHA FUNDING MODEL — IMPORTANT

Do NOT add a customer payment gateway in this phase.

Do NOT ask testers to pay Vobiz directly.

Do NOT expose Vobiz balance-management UI to testers.

Use:

```text
KeralAI operator
       ↓
pre-funded Vobiz parent/provider balance
       ↓
KeralAI provisions customer_use subaccounts
```

Tester receives:

```text
KeralAI Alpha promotional credit
```

The promotional credit is an internal testing allowance.

It is:

```text
non-withdrawable
non-transferable
not customer cash
not provider balance
not refundable as money
```

Its purpose is to simulate real future billing and put strict limits on platform cost during Alpha.

---

# 5. WHY TESTERS MUST NOT PAY VOBIZ

The product boundary must remain:

```text
Customer
   ↓
KeralAI
   ↓
Vobiz
```

NOT:

```text
Customer
   ├─ pays KeralAI
   └─ separately pays Vobiz
```

The latter would:

- destroy seamless onboarding
- expose underlying vendor complexity
- make billing confusing
- make plan pricing impossible
- weaken KeralAI's customer relationship
- complicate refunds/support
- make future carrier migration harder

KeralAI must remain billing authority.

---

# 6. ALPHA PHONE ACCESS APPROVAL

Not every invite necessarily needs a paid DID.

Add an explicit controlled Alpha capability such as:

```text
phone_activation_approved
```

or reuse a clean entitlement/override system if one already exists.

Default may be:

```text
false
```

Operator can approve a tester for real telephony.

Once approved:

```text
tester completes KYC
→ chooses number
→ activates themselves
```

The operator should NOT have to manually perform the purchase.

The operator only authorizes the tester to incur provider spend.

---

# 7. OPTIONAL INVITE CAPABILITIES

If cleanly compatible with existing invite metadata, support invite presets:

```text
browser_only
full_alpha
```

Example:

```text
browser_only
→ browser voice
→ no number purchase

full_alpha
→ browser voice
→ KYC
→ one DID
→ inbound calling
```

Do not create multiple application architectures.

This is only an entitlement/profile preset.

---

# 8. REAL KYC UX

Implement/complete the customer-facing KYC flow.

For Alpha external users:

```text
kyc_mode = customer_use
business_type = individual
```

Required:

```text
PAN
+
Aadhaar via DigiLocker
```

Prefer Vobiz hosted KYC.

---

# 9. KYC FLOW

Target:

```text
Phone
   ↓
Get your number
   ↓
Identity verification
   ↓
Create/resolve Vobiz customer_use subaccount
   ↓
Create hosted KYC session
   ↓
Redirect to Vobiz/DigiLocker
   ↓
User completes verification
   ↓
Return to KeralAI
   ↓
KeralAI shows "Verification in progress"
   ↓
Webhook + reconciliation
   ↓
GET authoritative KYC status
   ↓
kyc_calls_blocked === false
   ↓
Choose number
```

---

# 10. NEVER TRUST KYC REDIRECT STATUS

A browser redirect such as:

```text
?status=success
```

must NEVER unlock telephony.

The authoritative gate remains provider state:

```text
kyc_calls_blocked === false
```

plus:

```text
customer_use
business_type=individual
account active
```

---

# 11. KYC USER STATES

Support polished states:

```text
not_started
session_created
pending
verified
failed
expired
cancelled
provider_unavailable
```

Examples:

## Not started

```text
Verify your identity

Indian telecom rules require identity verification before
we activate your phone number.

You'll verify:
✓ PAN
✓ Aadhaar through DigiLocker

[Continue securely]
```

## Pending

```text
We're checking your verification

This usually completes automatically.
You can leave this page and come back later.
```

## Verified

```text
Identity verified

You're ready to choose your KeralAI number.

[Choose a number]
```

## Failed

Explain recoverably.

Do not expose Vobiz raw JSON/errors.

---

# 12. KYC PRIVACY

KeralAI should NOT store:

- PAN document files
- Aadhaar files
- DigiLocker credentials
- downloaded identity documents
- complete identity payloads not required for operation

Store only minimum provider state/reference metadata.

Raw webhook body may exist transiently for verification but should not become unnecessary long-term identity storage.

---

# 13. REAL NUMBER INVENTORY

After KYC approval, show real Vobiz inventory.

Do NOT use fixture numbers.

UI should prioritize simplicity.

Example:

```text
Choose your number

+91 80 XXXX 1023
Bengaluru
₹... / month

+91 80 XXXX 4812
Bengaluru
₹... / month
```

For Alpha, however, customer-facing commercial values can be based on KeralAI Alpha policy rather than raw provider fees.

---

# 14. PROVIDER COST SAFETY BEFORE NUMBER PURCHASE

Before displaying a number as activatable, evaluate current provider metadata.

Check:

```text
setup cost
rental cost
release fee
commitment
restrictions
country
capabilities
availability
```

Introduce configured provider exposure ceilings.

Example:

```text
ALPHA_MAX_DID_SETUP_COST_MINOR
ALPHA_MAX_DID_MONTHLY_COST_MINOR
```

or DB platform controls.

If a DID exceeds operator-approved exposure:

```text
do not allow automatic purchase
```

Either hide it or mark:

```text
Requires operator approval
```

Do not silently incur unexpected provider cost.

---

# 15. ALPHA NUMBER LIMIT

Alpha default:

```text
1 active DID / tenant
```

Enforce server-side transactionally.

Do not rely on UI.

---

# 16. NUMBER PURCHASE FLOW

Target:

```text
Tester selects DID
        ↓
server re-fetches / validates inventory
        ↓
KYC revalidated
        ↓
phone_activation_approved?
        ↓
platform purchase gate?
        ↓
provider readiness?
        ↓
Vobiz parent funding/balance safety?
        ↓
tenant Alpha credit?
        ↓
provider exposure ceiling?
        ↓
create wallet hold
        ↓
purchase using Vobiz subaccount
        ↓
create/configure Voice Application
        ↓
bind DID
        ↓
verify provider ownership/binding
        ↓
capture setup/rental Alpha charge
        ↓
ACTIVE
```

---

# 17. NEVER TRUST INVENTORY FROM THE BROWSER

Browser may send:

```text
providerNumberId
e164
```

but server must revalidate that the number:

- still exists
- remains available
- matches country
- matches expected identifier
- remains within provider-cost policy

before purchase.

---

# 18. PURCHASE IDEMPOTENCY

Double clicking:

```text
Activate
Activate
```

must never buy two DIDs.

Use existing operation locks/idempotency.

Ambiguous provider result:

```text
request timeout after Vobiz may have purchased
```

must produce:

```text
purchase_unknown / needs_review
```

and reconciliation.

Never blindly retry the POST.

---

# 19. ALPHA NUMBER CHARGING

For Alpha, simulate the future customer model.

Debit:

```text
number setup
number rental
voice usage
```

from KeralAI Alpha promotional credit.

Do NOT transfer these credits to Vobiz.

Provider charges remain paid from KeralAI's real Vobiz funding.

Example:

```text
Tester starts with:
₹500 Alpha credit

Number setup:
-₹50

Number first month:
-₹159

Remaining Alpha credit:
₹291
```

Amounts are illustrative; use configured Alpha pricing.

---

# 20. CLEARLY LABEL ALPHA CREDIT

UI should say:

```text
Alpha testing credit
```

not:

```text
Cash balance
```

Explain:

```text
Provided for closed testing.
No payment is required during Alpha.
```

Avoid implying stored monetary value that can be withdrawn.

---

# 21. NO USER TOP-UP YET

Remove/disable:

```text
Add money
Top up
Recharge
```

for Alpha users unless those actions clearly say unavailable.

Instead provide:

```text
Request more Alpha credit
```

This can create an operator-visible request or simple support action.

Operator may grant more through existing audited credit tools.

---

# 22. PHONE ACTIVATION SUCCESS UX

After purchase:

```text
Your KeralAI number is ready

+91 ...

Incoming calls
Active

Assistant
Maya

[Make a test call]
```

Optionally explain:

```text
Call this number from another phone to test your assistant.
```

---

# 23. PROVISIONING PROGRESS

Do not freeze the browser request while provider configuration completes.

Use persisted states such as:

```text
reserving
purchasing
configuring
verifying
active
failed
needs_review
```

UI:

```text
Setting up your number

✓ Number reserved
✓ Connected to KeralAI
• Activating incoming calls
```

Resume after refresh.

---

# 24. INBOUND CALLING MUST BE FULLY USABLE

Once a tenant's DID is active:

```text
PSTN caller
→ Vobiz DID
→ Answer callback
→ signed validation
→ DID registry
→ tenant
→ entitlement authorization
→ Alpha reservation
→ signed one-use bridge token
→ Vobiz WSS
→ Gemini Live
```

No manual provider configuration.

---

# 25. REAL CALLBACK SIGNATURE REQUIREMENT

This remains a blocker from previous sign-off.

Use Vobiz docs/MCP and/or operator-confirmed Vobiz support configuration to determine the supported way to make Vobiz emit callback validation headers.

Do NOT:

- remove signature verification
- add query-string secret bypass
- invent an Application API property
- mark readiness based only on local tests

Phone service stays fail-closed until signature emission is actually demonstrated.

---

# 26. PROVIDER ATTESTATION

Retain:

```text
VOBIZ_CALLBACK_SIGNATURES_VERIFIED
```

or the current equivalent.

It becomes `1` only after operator-recorded real evidence.

The coding agent must NOT set it automatically.

---

# 27. COMPLETE CALL EXPERIENCE

After real inbound phone call:

Store/update:

```text
caller
called number
tenant
provider UUID
start time
answer time
duration
end time
call status
transcript
summary
caller name where captured
caller number
message
callback request
appointment
tool actions
provider cost
customer Alpha usage
```

Ensure every record is tenant-scoped.

---

# 28. EXISTING ASSISTANT FEATURES MUST WORK ON PHONE

Audit every currently exposed assistant capability.

At minimum verify:

```text
assistant identity
preferred language
Malayalam
English
language switching
system instructions
additional info
knowledge retrieval
runtime mode
active instructions
availability
message taking
callback requests
appointments
contacts/CRM where implemented
end-call tool
barge-in/interruption
summary generation
transcription
```

Do not accept:

```text
works in browser
```

as proof that it works in phone mode.

---

# 29. FEATURE CAPABILITY MATRIX

Create:

```text
docs/alpha-feature-matrix.md
```

Example:

| Feature | Browser | Phone | Tested | Status |
|---|---|---|---|---|
| Assistant instructions | ✓ | ✓ | | |
| Malayalam | ✓ | ✓ | | |
| English | ✓ | ✓ | | |
| Knowledge | ✓ | ✓ | | |
| Appointment booking | ✓ | ✓ | | |
| Message capture | ✓ | ✓ | | |
| Callback request | ✓ | ✓ | | |
| End call | N/A | ✓ | | |
| Runtime modes | ✓ | ✓ | | |
| Barge-in | ✓ | ✓ | | |

Populate from actual code/tests.

Do not mark something supported merely because a UI exists.

---

# 30. PHONE-TO-INBOX WORKFLOW

A tester should experience real assistant outcomes.

For example:

```text
Caller
"Ask Nabeel to call me back"
```

should produce:

```text
Inbox
→ Callback request
→ caller number
→ caller name
→ summary
→ timestamp
```

Similarly:

```text
appointment
message
lead/contact
```

where supported.

---

# 31. CALL HISTORY

After every real Alpha call, user should see:

```text
Calls

+91 ...
Today · 5:42 PM · 2m 14s

Asked about appointment availability
Appointment requested
```

Mobile must use list/detail presentation rather than compressed desktop tables.

---

# 32. CALL DETAIL

Provide:

```text
caller
time
duration
summary
outcome
transcript
actions
usage
```

Useful user actions:

```text
Call back
Add contact
Mark resolved
```

Only expose actions already supported safely.

---

# 33. TRANSCRIPT PRIVACY

Never mix tenants.

No transcript should be obtainable through:

```text
foreign call ID
foreign phone number
foreign tenant ID
```

Add/retain tests.

---

# 34. REAL CALL COST SETTLEMENT

Continue using authoritative Vobiz CDR.

Never settle final telephony charge based only on bridge duration.

Flow:

```text
call ends
↓
usage pending
↓
Vobiz authoritative CDR
↓
validate UUID / DID / tenant / direction
↓
record provider actual cost
↓
consume included quota
↓
capture Alpha debit if applicable
↓
release unused reservation
```

---

# 35. DUPLICATE CDR SAFETY

Same Vobiz CDR received/reconciled multiple times:

```text
one call
→ one debit
```

No duplicate debit.

Keep integration tests.

---

# 36. PROVIDER BALANCE MONITORING

Since KeralAI is funding Alpha telephony, add operational monitoring of parent Vobiz balance if current API supports it.

Admin should see something like:

```text
Vobiz platform balance
Status: Healthy / Low

Available provider balance
₹...
```

Do not expose to normal tester.

Never expose Vobiz credentials.

---

# 37. VOBIZ LOW-BALANCE SAFETY

Introduce operator thresholds such as:

```text
VOBIZ_BALANCE_WARNING_MINOR
VOBIZ_BALANCE_HARD_FLOOR_MINOR
```

or DB platform controls.

Before provider-spending operations such as DID purchase:

```text
if parent provider balance < hard floor
→ block purchase
```

Do NOT necessarily reject an existing incoming call based solely on stale provider balance if the provider has already accepted it; use appropriate operational policy.

---

# 38. GLOBAL PROVIDER EXPOSURE

Continue tracking:

```text
provider_reserved_minor
provider_actual_minor
```

Include:

```text
number setup
number rental
call costs
```

in operator risk visibility where feasible.

Previous global exposure focused primarily on calls.

Extend it so DIDs cannot create unmonitored provider spend.

---

# 39. ALPHA MONTHLY BUDGET

Give each full-Alpha tester a hard operator-approved maximum.

Example concept:

```text
Alpha sponsored limit = ₹500
```

Effective use:

```text
number setup
+ rental
+ call usage
<= Alpha sponsored limit
```

No unlimited negative usage.

---

# 40. PLATFORM ALPHA BUDGET

Add a global Alpha spend ceiling.

Example:

```text
Vobiz exposure this month
₹X / ₹Y

Gemini estimate
₹A / ₹B
```

If platform cap is exhausted:

```text
new provider-spending actions blocked
```

Existing data and dashboard remain usable.

---

# 41. TESTER REQUESTS MORE CREDIT

Add a simple UX:

```text
Need more Alpha credit?

[Request more]
```

This should NOT create a payment.

It may:

- create an operator/support request
- record reason
- notify operator dashboard

Operator then grants credit manually.

Do not overbuild notifications if unnecessary.

---

# 42. NUMBER RELEASE DURING ALPHA

Do NOT expose a simple immediate:

```text
Delete number
```

button.

Vobiz release may have:

```text
release fee
pending release period
cooldown
routing detachment
```

For Alpha:

normal user gets:

```text
Pause number
Request release
```

Operator controls actual provider release.

This avoids testers accidentally causing irreversible/provider-cost changes.

---

# 43. PAUSE NUMBER

Tester may be allowed:

```text
Pause incoming calls
```

if supported safely.

This should be KeralAI-local suspension unless provider routing mutation is actually needed.

Re-enabling must re-check:

```text
subscription
KYC
wallet
provider routing
```

---

# 44. OUTBOUND CALLING

Do NOT add mass outbound calling.

If current implementation does not already support customer outbound calling fully, keep:

```text
phone_outbound=false
```

during the first complete Alpha.

Inbound calling is sufficient to validate the core product.

Outbound can be an Alpha 2 feature.

Do not let outbound block full inbound Alpha.

---

# 45. BROWSER AND PHONE EXPERIENCE SHOULD MATCH

Audit assistant behavior for inconsistent configuration.

Both should use the same tenant:

```text
profile
instructions
knowledge
voice
language
runtime mode
actions/tools
```

Transport-specific behavior may differ.

Do not maintain two different assistant personalities.

---

# 46. ONBOARDING — FULL ALPHA

Update first-run onboarding to:

```text
1. Welcome
2. Assistant type
3. Identity
4. Behavior
5. Knowledge
6. Browser test
7. Finish basic setup
```

Phone setup should then be an obvious optional next action:

```text
Your assistant is ready.

[Get a phone number]
[Continue using browser]
```

Do not force KYC during initial signup.

---

# 47. PHONE ACTIVATION SUB-FLOW

Inside Phone:

```text
1. Verify identity
2. Choose number
3. Activate
4. Test call
```

Show progress clearly.

---

# 48. MOBILE PHONE ACTIVATION

The entire KYC/number flow must work at:

```text
360
375
390
414 px
```

No desktop modal squeezed into mobile.

Use:

```text
full-screen steps
bottom sheets
large selectable DID rows
sticky primary action
safe-area spacing
```

where appropriate.

---

# 49. MOBILE TEST CALL EXPERIENCE

After activation:

```text
Your number

+91 ...

Active

[Copy number]
```

No assumption that clicking the number itself will dial the same device.

Provide simple instructions:

```text
Call this number from another phone to test the assistant.
```

---

# 50. ADMIN — FULL ALPHA TESTER VIEW

For each tenant, show:

```text
Account
Invite
Alpha mode
Subscription
Gemini mode
browser usage

KYC
Vobiz subaccount
phone access approved?

Number
number status
provisioning status

Alpha credit
reserved
spent

Phone usage
provider actual cost
pending CDR

Assistant
last call

Problems
needs_review
failed provisioning
late CDR
```

Do not expose sensitive identity documents.

---

# 51. ADMIN PHONE-ACCESS APPROVAL

Operator should be able to:

```text
Approve phone Alpha
Revoke future phone activation
```

This should be audited.

Revoking activation approval should not automatically release an already-owned DID.

It should stop new provisioning actions according to policy.

---

# 52. ALPHA SUPPORT ACTIONS

Admin needs controlled recovery actions:

```text
refresh KYC
retry number configuration
reconcile purchase
reconcile CDR
pause number
resume number
add Alpha credit
suspend tenant
resume tenant
```

Every mutation:

```text
requires platform admin
reason
unique operation reference
audit
idempotency where applicable
```

---

# 53. DO NOT GIVE TESTERS PROVIDER CREDENTIALS

Normal API responses must never contain:

```text
VOBIZ_AUTH_ID
VOBIZ_AUTH_TOKEN
subaccount token
parent account token
Gemini platform key
bridge signing secret
encryption key
```

---

# 54. PROVIDER SUBACCOUNT CREDENTIAL STORAGE

If Vobiz returns subaccount credentials once:

- store necessary token encrypted immediately
- never log
- never send to frontend
- never overwrite with plaintext metadata

Unknown credential result after timeout must enter support/recovery state.

Do not create a second subaccount blindly.

---

# 55. EMAIL EXPERIENCE

Closed Alpha testers are known people.

Full email infrastructure is optional.

However ensure:

```text
invite link
KYC redirects
support instructions
```

are understandable.

Mailbox ownership verification may remain deferred to Beta, but document it.

---

# 56. USAGE PAGE

Alpha tester sees:

```text
Alpha plan

Browser voice
12 / 60 min

Phone calls
18 / 60 min

Alpha testing credit
₹203 remaining

Phone number
1 / 1
```

And perhaps:

```text
This credit is provided for testing. No payment is required during Alpha.
```

Do not display provider financial accounting.

---

# 57. PAYMENT UI

For Alpha:

```text
Billing / Usage
```

rather than a normal production checkout.

Buttons:

```text
Request more Alpha credit
```

NOT:

```text
Pay Vobiz
```

NOT fake:

```text
Top up ₹500
```

---

# 58. FUTURE PAYMENT ABSTRACTION

Do not implement a gateway yet.

But ensure future integration can insert:

```text
PaymentProvider

createCheckout()
verifyWebhook()
refund()
```

without changing wallet semantics.

Future:

```text
payment success
→ immutable wallet topup
```

Alpha:

```text
operator grant
→ immutable promotional_credit
```

Same downstream wallet.

---

# 59. FEATURE TESTER FEEDBACK

Add lightweight product-feedback entry.

Example accessible from:

```text
More
→ Send feedback
```

or:

```text
Alpha feedback
```

Capture:

```text
tenant
user
page/context optional
category
message
created_at
status
```

Categories:

```text
Bug
Confusing
Suggestion
Voice quality
Phone call
Other
```

Do not add a huge support platform.

---

# 60. POST-CALL FEEDBACK

For Alpha, optionally show after call detail:

```text
How was this call?

👍 Good
👎 Had a problem
```

If negative:

```text
What went wrong?
Audio / Response / Incorrect info / Other
```

This will be valuable for trusted testers.

Do not make it intrusive.

---

# 61. FEEDBACK MUST INCLUDE SAFE TECHNICAL CONTEXT

Internally attach non-sensitive context:

```text
app build/version
call internal ID if relevant
tenant ID
browser/device class
timestamp
```

Never attach:

- raw secrets
- PAN/Aadhaar
- complete hidden provider payloads

---

# 62. FULL EXISTING FEATURE AUDIT

Do not assume existing pages work merely because they render.

Perform actual product workflow testing for:

```text
assistant configuration
profile
language
voice
system instructions
knowledge
runtime modes
active instructions
browser voice
phone voice
call history
call detail
transcript
summary
messages
callbacks
appointments
contacts
CRM if enabled
phone
usage
admin
PWA/mobile navigation
```

For each:

```text
create
read
update
failure
empty state
mobile
tenant isolation
```

where applicable.

---

# 63. REMOVE DEAD/DEVELOPER UX

Search normal-user UI for:

```text
Exotel
Vobiz Auth ID
API key
provider token
ws://
wss://
Answer URL
CallUUID
sub_auth_id
Application ID
```

Hide these from regular Alpha testers.

Provider name may be mentioned in legal/support context where appropriate, but not as configuration.

---

# 64. ALPHA TEST MODE INDICATOR

Use subtle:

```text
Closed Alpha
```

indicator.

Do not fill every screen with warnings.

Usage/billing page can explain that credits are sponsored testing credits.

---

# 65. REAL-GEMINI SMOKE FIRST

Before phone enablement:

Run one real platform-managed browser voice session.

Validate:

```text
microphone
Gemini Live connect
Malayalam
English
interruption
transcript
knowledge
session quota
session close
```

This is required.

---

# 66. VOBIZ TEST-MODE KYC

Before real identity:

Use Vobiz KYC test mode with a disposable customer_use/individual subaccount.

Run:

```text
failed
pending
verified
```

Validate KeralAI UX and status reconciliation.

Do not assign a production DID to mock-verified test subaccount.

---

# 67. REAL KYC ACCEPTANCE

Then perform ONE operator-approved real test:

```text
KeralAI invite
→ customer_use
→ individual
→ hosted KYC
→ PAN
→ DigiLocker
→ authoritative verified
→ kyc_calls_blocked=false
```

Record redacted evidence.

No identity documents in repo/docs.

---

# 68. REAL NUMBER ACCEPTANCE

Then approve a capped provider spend and:

```text
search DID
→ user selects
→ KeralAI purchase
→ binding
→ verification
→ ACTIVE
```

No Vobiz dashboard manual purchase.

Manual provider inspection is okay for verification.

---

# 69. FIRST REAL CALL

Follow existing `docs/live-vobiz-signoff.md`.

First call:

```text
trusted handset
→ Alpha DID
→ assistant
```

Keep under 60 seconds initially.

Test:

```text
normal greeting
Malayalam
English
tenant-specific knowledge
message taking
barge-in
caller hangup
```

Then verify:

```text
CDR
transcript
summary
action
usage
wallet
provider cost
```

---

# 70. TWO-TENANT PHONE ISOLATION

After first tenant succeeds:

Create tenant B.

Different:

```text
knowledge
assistant name
instructions
number
Vobiz subaccount
```

Call both numbers.

Absolutely verify no cross-routing.

This is mandatory before enabling phone access for external testers.

---

# 71. ROLLING AUTHORIZATION

During real phone call test:

operator disables voice for tenant.

Within current rolling-auth interval:

```text
active session must terminate gracefully
```

Also test:

```text
max duration
global phone gate
```

in controlled conditions.

---

# 72. PROVIDER BALANCE FAILURE TEST

Do NOT drain real provider balance.

Use fixtures/test seam to verify:

```text
provider balance below hard floor
→ new number purchase denied
```

and relevant operations fail safely.

---

# 73. ALPHA CREDIT EXHAUSTION TEST

Test:

```text
credit/quota sufficient
→ call allowed

credit/quota exhausted
→ next call denied
```

The user should get clear product behavior.

No huge negative balance.

---

# 74. PROVIDER PURCHASE FAILURE

Fixture:

```text
provider timeout after purchase
```

Expected:

```text
needs_review
wallet hold retained
no second purchase
admin recovery available
```

---

# 75. PROVISIONING RETRY

If DID purchased but binding fails:

```text
retry configuration on SAME DID
```

Never select/buy a second DID automatically.

---

# 76. CDR DELAY

Simulate:

```text
call completed
CDR unavailable
```

Expected:

```text
pending settlement
reservation retained
background reconciliation
```

When CDR arrives:

```text
settle once
```

---

# 77. CRON / RECONCILIATION

Configure the existing reconciliation route for Alpha deployment.

Use:

```text
CRON_SECRET
```

Schedule at an appropriate interval such as:

```text
every 5 minutes
```

if existing implementation/documentation expects it.

Reconciliation must be idempotent.

---

# 78. RATE-LIMIT CLEANUP

Add safe scheduled retention for expired:

```text
alpha_rate_limits
```

and any other disposable Alpha operational records where appropriate.

Do NOT delete:

```text
wallet ledger
CDRs
audit events
billing history
```

---

# 79. MONITORING

Implement or document practical Alpha monitoring.

At least expose operator visibility for:

```text
bridge health
active calls
Gemini failures
Vobiz failures
pending CDR
oldest pending CDR
failed provisioning
needs_review
provider balance
provider monthly cost
AI estimate
```

External alert service is optional for the first few testers.

---

# 80. CI

Before merging to `main`, add GitHub CI if absent.

At minimum:

```text
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Integration/UI tests may run separately if they require database setup.

Do not rely solely on a local Codex report.

---

# 81. BRANCH / MERGE HYGIENE

Before final Alpha release candidate:

```text
update feature branch from latest main
resolve divergence
run entire validation again
```

Create reviewed PR.

Do not silently force old main state over newer commits.

---

# 82. SMOKE TEST SUITE — EXPAND

Keep existing:

```text
npm run test:smoke
```

Add checks for complete Alpha configuration.

Strict mode should validate:

```text
database
migrations
auth URLs
admin allowlist
invite status
platform Gemini
bridge
shared secret fingerprint/match where possible
Vobiz parent auth read-only
Vobiz parent balance read-only
phone/purchase gates
provider reserve configuration
pricing
reconciliation configuration
```

Do not mutate providers.

---

# 83. COMPLETE ALPHA AUTOMATED TESTS

Add/retain automated tests for:

### Signup

```text
invite valid
invite expired
invite reused
wrong email
concurrent redemption
```

### Gemini

```text
managed
BYOK
missing key
cross-tenant
```

### KYC

```text
not started
pending
verified
failed
expired
spoofed redirect
```

### Number

```text
inventory
price exposure ceiling
one-number limit
double click
purchase timeout
binding failure
same-DID retry
```

### Phone

```text
valid inbound
KYC blocked
tenant suspended
wallet exhausted
quota exhausted
concurrency limit
provider gate off
signature invalid
token replay
```

### Billing

```text
setup debit
rental debit
call reservation
CDR settlement
duplicate CDR
late CDR
negative recovery edge
```

### Admin

```text
phone approval
credit
suspend
resume
reconcile
cross-role denial
```

### Tenant isolation

A/B for everything.

---

# 84. REAL SMOKE TESTS

Real smoke tests are operator-controlled and must not run in CI.

Maintain explicit scripts/runbook for:

```text
real Gemini browser
Vobiz test KYC
real KYC
real DID purchase
real phone call
```

Every provider-cost action requires explicit human invocation.

---

# 85. RESPONSIVE QA

Full user path at:

```text
360 × 800
375 × 812
390 × 844
414 × 896
768 × 1024
1280+
```

Test:

```text
invite
signup
onboarding
browser voice
Phone
KYC transition
number selection
activation
usage
calls
call detail
feedback
```

No horizontal page scrolling.

---

# 86. PWA / MOBILE

Maintain:

```text
safe areas
bottom navigation
touch targets
keyboard-safe forms
full-screen flows
standalone display
```

Avoid hover-only controls.

---

# 87. DO NOT IMPLEMENT REAL CUSTOMER PAYMENTS YET

Explicitly DO NOT add:

```text
Razorpay
Cashfree
PayU
Stripe checkout
auto top-up
payment cards
UPI
```

during this phase.

Reason:

We first need real Alpha data for:

```text
Vobiz cost
Gemini cost
average call duration
number cost
support cost
```

before setting commercial plans.

---

# 88. PAYMENT-READY ARCHITECTURE

However ensure the future integration can work as:

```text
Payment Provider
        ↓
successful webhook
        ↓
wallet_transactions(type=topup)
```

All existing Alpha usage logic should continue unchanged.

Do not build a second billing system later.

---

# 89. DO NOT LET USERS PAY VOBIZ DIRECTLY

There should be no customer-facing:

```text
Vobiz recharge
Vobiz wallet
provider checkout
```

KeralAI owns customer billing.

Vobiz parent/provider funding remains an operator responsibility.

---

# 90. DOCUMENT ALPHA COMMERCIAL MODEL

Create:

```text
docs/alpha-funding-model.md
```

Explain:

```text
Vobiz real provider spend
→ paid by KeralAI operator

Gemini real provider spend
→ paid by KeralAI operator

Tester
→ receives sponsored KeralAI Alpha credit

KeralAI
→ meters tester independently
```

---

# 91. ALPHA FEATURE STATUS PAGE FOR OPERATOR

Create a simple internal checklist/status showing:

```text
Managed Gemini          Ready
Vobiz parent auth       Ready
Callback signatures     Pending / Ready
KYC                     Ready
Number purchase         Ready
Carrier audio           Ready
CDR billing             Ready
Reconciliation          Ready
```

Do not make user-facing technical dashboards.

---

# 92. DEFINITION OF "COMPLETE CLOSED ALPHA"

The implementation is NOT complete merely because tests compile.

Complete Alpha means a trusted external tester can:

```text
1. Receive invitation.
2. Register.
3. Configure assistant.
4. Add knowledge.
5. Talk through browser.
6. Enter Phone setup.
7. Complete their own real KYC.
8. Select a real DID.
9. Activate it without opening Vobiz.
10. Call it from a normal phone.
11. Talk to their configured assistant.
12. Use core assistant actions.
13. See call transcript and summary.
14. See callback/message/appointment outcomes.
15. See usage and remaining sponsored Alpha credit.
16. Give feedback.
```

Operator can:

```text
17. See tenant usage.
18. See provider exposure.
19. Add Alpha credit.
20. Approve phone access.
21. Suspend/resume tenant.
22. Recover failed KYC/provisioning/settlement.
23. Stop platform voice globally.
```

And:

```text
24. Tenant A cannot access Tenant B.
25. Tester cannot generate unbounded provider spend.
```

---

# 93. STAGED ENABLEMENT

Do not enable everything simultaneously.

Execute:

## Phase A — merge/readiness hygiene

```text
branch sync
CI
full existing tests
configuration audit
```

## Phase B — real managed Gemini

```text
dedicated Alpha key
browser session
A/B tenant isolation
```

## Phase C — tester phone entitlement

```text
phone_activation_approved
Alpha funding model
provider cost ceilings
```

## Phase D — KYC

```text
test-mode KYC
real hosted KYC
status UX
```

## Phase E — number activation

```text
real inventory
provider balance check
purchase
Application binding
active DID
```

## Phase F — real carrier call

```text
signature evidence
WSS
Gemini
audio
barge-in
CDR
```

## Phase G — core feature matrix

```text
knowledge
messages
appointments
callbacks
modes
summary
transcripts
```

## Phase H — complete Alpha operations

```text
admin recovery
feedback
monitoring
cron
retention
```

## Phase I — tester cohort

No code action.

Document readiness for:

```text
3–5 trusted testers
```

---

# 94. HUMAN APPROVAL BOUNDARIES

Implementation agent MAY:

- edit code
- create migrations
- use fixtures
- use Vobiz documentation
- make read-only Vobiz calls if existing credentials/config permit
- run local tests
- run smoke checks

Implementation agent MUST NOT automatically:

- submit real PAN/Aadhaar
- create a paid DID
- release a DID
- start a paid carrier call
- change real provider callback configuration
- transfer provider money
- enable phone production attestation
- deploy to production
- invite external people

For each real provider-mutating smoke step, prepare the exact command/UI action and wait for explicit operator execution/approval.

---

# 95. FINAL VALIDATION

Before reporting implementation complete run:

```text
npm ci
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run test:integration
npm run test:ui
npm run test:smoke
npm run migrate:status
git diff --check
```

Run bridge checks.

Run dependency audit.

Run secret scan.

Ensure all temporary schemas/test records are removed.

---

# 96. FINAL REPORT

Return:

## Current release status

One of:

```text
Implementation complete, live acceptance pending
Closed Alpha ready
Not ready
```

Do not exaggerate.

## Architecture changes

What changed.

## KYC

Exact user flow and real-provider state.

## Phone numbers

Search/purchase/binding/release policy.

## Alpha funding

How Vobiz/Gemini costs are paid and how tester credits work.

## Calls

Real and fixture validation.

## Existing features

Feature matrix.

## Usage/billing

Reservations, CDR, credits, provider costs.

## Admin

New operator controls.

## Feedback

Tester-feedback capabilities.

## Mobile

Flows tested.

## Security

Tenant isolation, credential protection, identity-data handling.

## Database

New additive migrations.

## Tests

Exact results.

## Live operations still required

Anything needing human/provider approval.

## First tester checklist

Exact actions for inviting the first 3–5 trusted Alpha testers.

---

# 97. FINAL PRODUCT PRINCIPLE

For a tester, the complete experience should be:

```text
"I was invited to KeralAI,
made my assistant,
tested it,
verified my identity,
picked my phone number,
called it,
and it worked."
```

Not:

```text
"I created Gemini and Vobiz accounts,
copied API credentials,
configured telephony,
and eventually got KeralAI running."
```

KeralAI owns the product experience.

Vobiz and Gemini are infrastructure underneath it.