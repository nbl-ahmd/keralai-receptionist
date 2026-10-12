# Alpha assistant feature evidence — 2026-10-12

Code presence is distinct from actual model/provider acceptance. This read-only
matrix records the audited existing implementation; it does not complete Phase G.
All real carrier acceptance remains pending. Ordinary browser report mode persists
outcomes; explicit non-report test mode has demo-only outcomes and must not be
used to claim real inbox persistence.

| Feature | Browser implementation | Phone implementation | Evidence / remaining test |
| --- | --- | --- | --- |
| Assistant identity/instructions | Tenant profile, shared prompt | Tenant profile, shared prompt | Real browser identity isolation; real phone pending |
| English/Malayalam greeting | Shared language-aware greeting | Same shared greeting | Actual browser audio/transcripts passed for two tenants; carrier pending |
| Language switching | Shared caller-preference instruction | Same instruction | Spoken Malayalam greeting then English preference observed in browser; carrier pending |
| Additional info | Tenant profile prompt | Tenant profile prompt | Code audit; complete behavioral acceptance pending |
| Knowledge | Tenant embedding/search tool | Tenant embedding/search tool | Actual browser Gemini tool lookup Wednesday vs Thursday; phone tool acceptance pending |
| Runtime modes/expiry | Tenant runtime instruction at setup | Tenant runtime instruction at setup | Code audit; complete mode/expiry scenario coverage pending |
| Active instructions | Fresh tenant instructions at setup | Fresh tenant instructions at setup | Code audit; relevant/conflicting/expired instruction acceptance pending |
| Availability | Profile/runtime prompt and admission | Same prompt plus phone admission gates | Isolated subscription/voice/readiness tests; human scenarios pending |
| Appointment booking | Persist in report mode | Persist, call linkage and per-slot promise deduplication | Code audit; real tool-to-inbox acceptance pending |
| Message capture | Persist in report mode | Persist with tenant/call/caller context | Code audit; real tool-to-inbox acceptance pending |
| Callback requests | Persist in report mode | Persist with tenant/call/caller context | Code audit; real tool-to-inbox acceptance pending |
| Quote requests | Persist in report mode | Persist with tenant/call/caller context | Code audit; real tool-to-inbox acceptance pending |
| Contacts/CRM | Per-tenant optional best-effort sync | Per-tenant optional best-effort sync | Code audit; configured CRM success/outage scenarios pending |
| End-call tool | Configurable delayed relay close | Configurable checkpoint/stop then provider hangup | Transport/guard fixtures; actual carrier hangup/timing pending |
| Interruption | Gemini interruption clears browser audio | Gemini interruption sends clearAudio | Browser real-model interruption and phone transport fixtures; carrier pending |
| Transcripts/summary | Tenant-local report persistence | Tenant-local call/log persistence | Browser audio/transcript smoke + DB isolation; complete phone outcome acceptance pending |
| Billing/CDR | Browser bounded usage settlement | Authoritative CDR, one immutable debit | Real browser close/settlement and isolated phone CDR fixtures; carrier CDR pending |

Sources inspected: `bridge/shared/maya-config.mjs`, `bridge/browser-session.mjs`,
`bridge/server.mjs`, `bridge/db.mjs`, `bridge/shared/runtime-modes.mjs`,
`lib/telephony/inbound.ts`, unit/DB/UI test files and live Gemini smoke evidence.
The provider KYC/signature blockers and exact acceptance sequence are in
[phone provider evidence](./phone-alpha-provider-blockers.md).
