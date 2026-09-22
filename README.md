# KeralAI Receptionist

> **Maya** — a Malayalam-first AI voice receptionist that answers calls, answers from your own
> knowledge base, books appointments, syncs to your CRM, and reports every call.

The platform pairs the **Gemini 2.5 Live API** (real-time speech in/out) with **Neon Postgres**
(durable state + pgvector retrieval) and an **Exotel** phone bridge.

---

## Architecture

```
┌──────────────┐   audio    ┌──────────────────┐   audio    ┌────────────────────┐
│  Caller /    │ ─────────► │  Next.js app     │ ─────────► │  Gemini 2.5 Live   │
│  Browser     │ ◄───────── │  + Exotel bridge │ ◄───────── │  (native audio)    │
└──────────────┘            └────────┬─────────┘            └────────────────────┘
                                     │ tool calls: searchKnowledgeBase / bookAppointment
                                     ▼
                            ┌──────────────────┐        ┌──────────────────┐
                            │  Neon Postgres   │◄──────►│  CRM webhook     │
                            │  + pgvector      │        │  (HubSpot/Zoho/  │
                            └──────────────────┘        │   Zapier/n8n…)   │
                                                        └──────────────────┘
```

**Flow:** call → transcript captured live → intent understood → knowledge retrieved (RAG) →
appointment booked → contact + call + booking pushed to CRM → report written to Postgres.

| Layer | Technology |
| --- | --- |
| Voice | Gemini 2.5 Flash native audio (`Live API`), Aoede voice |
| Retrieval | pgvector cosine search over 3072-dim `gemini-embedding-2` vectors |
| Data | Neon Postgres (serverless, ap-southeast-1) |
| Telephony | Exotel WebSocket bridge with PCM resampling |
| CRM | Pluggable adapter (`none` \| `webhook`) |

---

## Quick start

**Prerequisites:** Node.js ≥ 18 and a Neon Postgres database.

```bash
npm install
cp .env.local.example .env.local     # fill in DATABASE_URL + Gemini keys
npm run migrate                      # create the schema
npm run seed                         # load company profile + knowledge base
npm run dev                          # http://localhost:3000
```

Visit `/` for the marketing site with a live voice demo, and `/dashboard` for the console.

### Environment

Everything is documented in `.env.local.example`. The essentials:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | **Required.** Neon pooled connection string (`sslmode=require`). |
| `GEMINI_API_KEY` | **Required** server-side. Used by the bridge, embeddings, and knowledge chat. |
| `NEXT_PUBLIC_GOOGLE_API_KEY` | **Required** for the browser demo. Exposed to visitors — use a restricted key. |
| `CRM_PROVIDER` / `CRM_WEBHOOK_URL` | Optional CRM mirroring. |
| `BOOKING_OPEN_TIME` / `BOOKING_CLOSE_TIME` / `BOOKING_SLOT_MINUTES` | Booking rules. |

> **Security:** `GEMINI_API_KEY` is server-only. `NEXT_PUBLIC_*` keys are embedded in the browser
> bundle, so create a separate key restricted to your domains and the Generative Language API.

### Database commands

```bash
npm run migrate            # apply pending migrations
npm run migrate:status     # list applied / pending
npm run seed               # seed profile + knowledge (idempotent)
```

Migrations are tracked in `schema_migrations`; adding a file to `db/migrations/` is enough.

---

## Phone bridge (Exotel)

```bash
npm run dev:bridge         # development (Next.js + WebSocket bridge)
npm run start:bridge       # production
```

The bridge listens on `ws://<host>:<port>/ws/exotel` and:

- resamples Exotel PCM (8 kHz) ↔ Gemini Live (16 kHz in / 24 kHz out) in pure JS;
- handles barge-in by flushing the output buffer;
- executes `searchKnowledgeBase` (pgvector) and `bookAppointment` tool calls;
- stores the call, transcript, lookups, and bookings in Postgres;
- mirrors the contact, call, and booking to the CRM; and
- shuts down gracefully on `SIGTERM`/`SIGINT` (releasing the Postgres pool).

Point your Exotel Voicebot applet's WebSocket URL at the path above.

---

## CRM integration

Set `CRM_PROVIDER=webhook` and `CRM_WEBHOOK_URL` to mirror every call and booking. The endpoint
receives:

```json
{
  "event": "contact.call_completed | contact.appointment_booked",
  "contact": { "id": "…", "name": "…", "phone": "…", "email": "…", "company": "…", "source": "phone" },
  "call": { "callSid": "…", "intent": "…", "outcome": "booked", "summary": "…", "durationSec": 62 },
  "appointment": { "date": "2026-09-28", "time": "10:00", "reason": "…", "status": "confirmed" },
  "company": { "name": "…", "industry": "…", "phone": "…" },
  "sentAt": "2026-09-22T14:27:34.790Z"
}
```

Respond `2xx` (optionally `{ "id": "crm-123" }`) and the external id is stored on the contact for
future correlation. Sync is best-effort: failures are recorded in `crm_sync_events` and never
interrupt a live call. Requires no code change to support a new provider — implement `CrmAdapter`
in `lib/crm/index.ts` (and mirror it in `server/crm.mjs` for phone calls).

---

## API

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/health` | `GET` | Dependency probe; returns 503 when Postgres is unavailable. |
| `/api/metrics` | `GET` | Aggregated dashboard metrics, CRM status, booking rules. |
| `/api/company-profile` | `GET` `POST` | Business identity used in the system instruction. |
| `/api/knowledge` | `GET` `POST` `DELETE` | Knowledge CRUD; writes re-chunk and re-embed. |
| `/api/knowledge/search` | `POST` | pgvector similarity search (top 3). |
| `/api/knowledge/chat` | `POST` | Chat-style capture; returns a draft entry. |
| `/api/appointments` | `GET` `POST` `PATCH` `DELETE` | `?availability=YYYY-MM-DD`, `?id=…&format=ics` |
| `/api/calls` | `GET` `POST` `DELETE` | Call records with transcripts and lookups. |
| `/api/contacts` | `GET` `POST` | CRM-facing contacts. |

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Landing page with the live agent demo (no persistence). |
| `/dashboard` | Console: overview, call reports, knowledge ops, voice settings, CRM. |

---

## Dashboard

- **Command overview** — live metrics, conversion funnel, recent calls, appointments with inline
  status editing, CRM status, and contacts.
- **Calls & reports** — filterable call log with the full transcript, knowledge lookups, and the
  bookings produced by each call.
- **Knowledge ops** — add knowledge by chat, paste, or file upload (AI extraction), then delete
  or re-index.
- **Voice console** — persona, pitch, speed, and company profile.

---

## Data model

`company_profile` · `knowledge_items` · `knowledge_embeddings` (vector 3072) · `contacts` · `calls`
· `call_transcript_turns` · `call_knowledge_queries` · `appointments` · `crm_sync_events`

See `db/migrations/001_init.sql`.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run dev:bridge` | Next.js + Exotel WebSocket bridge |
| `npm run build` / `start` | Production build / serve |
| `npm run migrate` / `migrate:status` | Apply / inspect migrations |
| `npm run seed` | Seed profile + knowledge with embeddings |
| `npm run lint` | ESLint |