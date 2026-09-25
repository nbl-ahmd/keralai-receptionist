# Manual testing

Developer-preview test matrix covering authentication, tenant isolation, secrets,
runtime modes, bridge routing, and mobile PWA behaviour.

Use two accounts: **A** and **B**. Record results as you go.

## Automated checks first

```bash
npm run migrate:status   # confirm 006–008 are applied
npm run build            # production build
npm run lint             # eslint
```

The bridge files can be syntax-checked with `node --check bridge/server.mjs`.

## Authentication and provisioning

1. **Register user A.** Confirm A lands in the dashboard and receives tenant A
   (Settings → workspace name; `/api/tenant` returns a tenant with role `owner`).
2. **Register user B.** Confirm B receives a different tenant with role `owner`.
3. **Sign out and back in** as each user; confirm the session persists and the
   dashboard reloads with the correct tenant.
4. **Unauthenticated API access.** While signed out (or in a private window),
   request `/api/company-profile`, `/api/knowledge`, `/api/calls`, `/api/modes`,
   and `/api/tenant`. Each must return **401** (not data, not 500).
5. **Direct page access.** Open `/dashboard` while signed out; middleware should
   redirect to `/login?next=/dashboard`.

## Tenant isolation

6. **Knowledge.** Add knowledge item **X** to A. Query B's knowledge list and
   knowledge search; **X must not appear**.
7. **Company profile.** Set a distinctive profile field for A. Confirm B's
   `/api/company-profile` does not contain A's value.
8. **Cross-tenant header.** As B, call `/api/company-profile` with
   `x-tenant-id: <A's tenant id>`. The server must ignore/deny it (B must not
   receive A's data) — expect normal B data or `403`, never A data.
9. **Calls.** Generate/seed a call for A. Confirm B's `/api/calls` does not list
   it.
10. **Contacts / appointments / inbox.** Create a contact, appointment, callback,
    and message for A. Confirm none are visible to B.
11. **Embeddings.** Add searchable knowledge to A only, then search as B. B must
    never receive A's matches.

## Secrets

12. **Save Gemini key for A** in Settings → Providers. Confirm the UI/API show
    only `configured`, `provider`, `keyName`, `maskedSuffix`, timestamps — never
    the key.
13. **Confirm B cannot retrieve A's secret.** As B, read A's tenant secrets via
    `/api/tenant/secrets` scoped to A's tenant id (if attempted) and inspect B's
    own list; A's key material must never appear.
14. **Secret rotation.** Replace A's key with a new value. Confirm the masked
    suffix changes, the old value is unrecoverable, and voice still works.
15. **Logging.** Trigger a session and inspect bridge/app logs for API keys,
    tokens, or encryption keys. None must appear.

## Runtime modes and instructions

16. **Activate "Meeting" for A.** Confirm the dashboard header shows the active
    mode and (if set) the expiry.
17. **New A voice session receives Meeting instruction.** Start a live session as
    A and confirm the assistant reflects the meeting state.
18. **B does not receive A's mode.** Start a live session as B; B must not be
    told about A's meeting state.
19. **Mode expiration.** Activate a mode with a short expiry (e.g. 1 minute for
    testing). After it passes, confirm the dashboard shows Available and a new
    session no longer injects the mode.
20. **Custom mode + active instructions.** Set a custom mode and add an active
    instruction for A; confirm both are honored and that the instruction does
    **not** appear in normal knowledge search results.

## Bridge routing

21. **Browser voice token.** Generate A's browser voice token; confirm the
    connection succeeds and is attributed to A's tenant.
22. **Cross-tenant token.** Take B's token and tamper/transfer it to attempt A's
    tenant (e.g. add `?tenantId=<A>`); the bridge must use the token's tenant and
    reject the mismatch attempt. Expired or malformed tokens must return **401**.
23. **Exotel A URL.** Request A's Exotel URL from Settings → Providers. Connect
    with A's slug + token; confirm the call resolves to A. Test all accepted
    token channels: `?token=`, the malformed `?token:<token>=` key, an
    `Authorization: Basic` header (`tenant:<token>`), and a trailing
    `/ws/exotel/<slug>/<token>` path segment.
24. **Exotel B URL.** Repeat for B; confirm B's call resolves to B and never to A.
25. **Exotel hardening.** Call `/ws/exotel` with no slug (expect `404`), an
    unknown slug (expect `404`), and a wrong token (expect `404`). Rotate A's
    token and confirm the old URL stops working.
26. **Exotel account credentials.** In Settings → Providers → Exotel account, save
    A's Account SID / API key / API token and click **Test connection** (expect a
    connection result using A's own account). Confirm B cannot see or read A's
    Exotel credentials through any settings or API response, and that A's and B's
    credentials are stored independently.

## Authorization and data ownership

27. **Role checks.** With an `owner` account, exercise owner-only actions. If you
    can create an `admin`/`member` membership manually, confirm those roles are
    restricted appropriately (expect `403` where not permitted).
28. **Call data stays tenant-scoped.** Complete or seed calls for A and B;
    confirm every transcript turn, metric, log, booking, and CRM event is only
    reachable from its own tenant.

## Mobile and PWA

29. **Small widths.** Check the dashboard, settings, calls, and knowledge pages
    at **320, 360, 375, 390, and 414 px**, plus tablet and desktop. No horizontal
    overflow; all interactive targets ~44px or larger.
30. **Bottom navigation.** On a phone width, the fixed bottom nav appears and
    switches tabs; it is hidden at `lg`. Content is not hidden behind it.
31. **Active mode visibility.** Confirm the current mode and expiration are
    visible on the dashboard and the one-tap controls (Available, Meeting,
    Driving, Sleep, Focus, DND) work.
32. **Installability.** In production, the manifest loads and the app is
    installable. The service worker registers and caches only
    `/_next/static/` and icons.
33. **No cached auth data.** Confirm `/api/*` responses and WebSocket traffic are
    never served from cache, and signing out does not leave stale authenticated
    pages.

## Definition of done

- All automated checks pass.
- Every isolation check above confirms no cross-tenant leakage.
- No secret material appears in logs or API responses.
- The dashboard is usable from 320px up to desktop with no overflow.
- `docs/` accurately describes the shipped behaviour.