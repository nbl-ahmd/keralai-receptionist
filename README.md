# KeralAI Receptionist

> **Maya** — a Malayalam-first AI voice receptionist that answers calls, answers from your own
> knowledge base, books appointments, syncs to your CRM, and reports every call.

The platform pairs the **Gemini 2.5 Live API** (real-time speech in/out) with **Neon Postgres**
(durable state + pgvector retrieval) and an **Exotel** phone bridge.

---

## Architecture & Deployment

The application is architected into two decoupled, independently deployable services:

```
┌─────────────────────────────────────────┐       ┌─────────────────────────────────────────┐
│     Next.js Dashboard & Web App         │       │    Standalone Phone Bridge Service      │
│          (Deploy to VERCEL)             │       │           (Deploy to RENDER)            │
│                                         │       │                                         │
│ • Company Profile & Knowledge Base UI   │       │ • Standalone Node.js HTTP/WS service    │
│ • REST API routes (/api/*)              │       │ • /ws/exotel (Phone ↔ Gemini Live)      │
│ • @neondatabase/serverless driver       │       │ • /ws/browser (Web Audio relay)         │
│                                         │       │ • /health (Render health probe)         │
│                                         │       │ • Native pg Pool (cached profile & TTL) │
└────────────────────┬────────────────────┘       └────────────────────┬────────────────────┘
                     │                                                 │
                     ▼                                                 ▼
             ┌─────────────────────────────────────────────────────────────────┐
             │                   Neon Postgres (Pooled Endpoint)               │
             │                    + pgvector for similarity                    │
             └─────────────────────────────────────────────────────────────────┘
```

| Component | Host | Runtime | DB Driver |
| --- | --- | --- | --- |
| Dashboard & UI | **Vercel** | Next.js 14 App Router | `@neondatabase/serverless` (HTTP fetch) |
| Phone / Audio Bridge | **Render** | Node.js (`bridge/server.mjs`) | `pg` Pool (TCP with PgBouncer) |

---

## Quick start

**Prerequisites:** Node.js ≥ 18 and a Neon Postgres database.

```bash
npm install
cp .env.local.example .env.local     # fill in DATABASE_URL + Gemini keys
npm run migrate                      # create the schema
npm run seed                         # load company profile + knowledge base
npm run dev                          # start Next.js dashboard (http://localhost:3000)
npm run dev:bridge                   # start standalone audio bridge (http://localhost:3001)
```

Visit `http://localhost:3000/` for the landing page with voice demo, and `/dashboard` for the management console.

### Environment

Everything is documented in `.env.local.example` and `bridge/.env.example`. The essentials:

| Variable | Target | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Vercel & Render | **Required.** Neon pooled connection string (`sslmode=require`). |
| `GEMINI_API_KEY` | Vercel & Render | **Required** server-side. Used by bridge, embeddings, knowledge chat. |
| `NEXT_PUBLIC_BRIDGE_WS_URL` | Vercel | **Required in production.** Public WebSocket origin of the Render bridge, e.g. `wss://keralai-bridge.onrender.com`. The browser demo connects here (the dashboard and bridge are different hosts). |
| `PUBLIC_APP_ORIGIN` | Render bridge | Optional origin allow-list for the browser WebSocket relay. Comma-separated, e.g. `https://keralai-receptionist.vercel.app`. Trailing slashes/casing ignored; if unset, any origin is allowed. A mismatch returns HTTP 403 on the `/ws/browser` handshake. |
| `CRM_PROVIDER` / `CRM_WEBHOOK_URL` | Vercel & Render | Optional CRM mirroring. |

> The browser demo cannot derive the relay URL from `window.location` because the
> dashboard (Vercel) and the bridge (Render) are separate services. Set
> `NEXT_PUBLIC_BRIDGE_WS_URL` on Vercel and redeploy (it is inlined at build
> time); otherwise the client falls back to the page origin and `/ws/browser`
> returns 404.

---

## Phone bridge (Exotel on Render)

```bash
npm run dev:bridge         # local development bridge
npm run start:bridge       # production start
```

The bridge is configured via `render.yaml` for Render Web Service deployment (Root Directory `bridge`, Start Command `node server.mjs`):
- Health check probe: `GET /ping` (alias `GET /health`)
- WebSocket endpoints: `wss://<bridge-host>/ws/exotel` and `wss://<bridge-host>/ws/browser`
- Resamples Exotel PCM (8 kHz) ↔ Gemini Live (16 kHz in / 24 kHz out) with precomputed ratios;
- In-memory profile caching with TTL + version-check query;
- Fire-and-forget background CRM sync;
- **Dashboard-managed voice settings** (Dashboard → Settings): voice, pitch, speed, and an opening-greeting toggle/custom text, stored in `company_profile` and applied to the next call. Env vars (`MAYA_VOICE`, `MAYA_PITCH`, `MAYA_SPEED`, `MAYA_GREETING`) are fallback defaults only;
- **Real tool execution**: on every Live `functionCall`, the matching handler runs, writes to Neon, and returns a `functionResponse`. Tools: `bookAppointment` → `appointments`; `requestCallback` → `callback_requests`; `captureQuoteRequest` → `quote_requests`; `takeMessage` → `messages`; `searchKnowledgeBase` → pgvector. Every call also writes a `call_log` row on hangup. A DB error returns a `FAILED` response so Maya never falsely confirms;
- **Inbox (CRM)** page (`/dashboard/crm` or Dashboard → Inbox): recent appointments, callback requests, quote requests, and messages, with one-click "mark handled/read" status updates;
- Audio sample rate auto-detected per call from Exotel (`start.media_format.sample_rate` / `?sample-rate=`);
- Shuts down gracefully on `SIGTERM`/`SIGINT`.

Point your Exotel Voicebot applet's WebSocket URL at:
`wss://<render-service-name>.onrender.com/ws/exotel`

### Observability / latency

The bridge emits low-volume, structured `[bridge][perf]` lines to stdout (Render logs) so you can
see where time is spent without logging per audio chunk:

- `call-start`, `gemini` (connect ms + buffered audio), `barge-in`, `tool` (duration + ok), `crm`
  (duration + ok), and `bg` (background task duration, and whether it ran during a call).
- A per-call aggregate (`kind=interval` every `LATENCY_LOG_INTERVAL_MS`, and `kind=close`): audio
  in/out throughput, audio processing avg/p95, turn latency avg/p95, interrupts, and per-tool stats.
- `[bridge][db] slow query <ms>ms: …` for queries over `SLOW_DB_MS` (default 250).
- `GET /metrics` returns a JSON snapshot (counters + latency percentiles) for benchmarking;
  protect it with `METRICS_TOKEN` or disable with `METRICS_ENABLED=0`.
- Set `LATENCY_LOG=0` to silence perf logs, or `VERBOSE_AUDIO_LOG=1` for per-chunk tracing.

**Persisted history:** the bridge also writes one `call_metrics` row per completed call (phone and
browser in report mode) via `upsertCallMetrics` — the aggregate above, keyed to `calls.id`. Run
`npm run migrate` to create the table (`db/migrations/002_call_metrics.sql`). The dashboard's
**Performance** page (`/dashboard/performance`) reads it through `GET /api/call-metrics` and shows
only real, stored data (no placeholders).

> Background work (CRM sync, audit writes, call-record upserts) is logged as `[perf] bg …` with
> `during_call=1`; because the audio path never awaits it, inbound/outbound processing times stay
> flat while it runs — useful for verifying async behaviour.

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