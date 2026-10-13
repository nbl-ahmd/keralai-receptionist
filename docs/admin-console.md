# Administration and dashboard performance

The platform console is `/admin`. Signed-in platform operators see an Administration link in the workspace sidebar and a shield button on mobile. `/dashboard/admin` redirects to `/admin` for existing bookmarks.

Sections: overview, workspaces, operations, providers and audit log. Workspace accounts open in a drawer. Credit adjustments display rupees and submit integer paise; retry references and reasons remain required. Provider readiness is separate from enabling controls.

## Access

`PLATFORM_ADMIN_USER_IDS` remains the sole platform-operator allowlist (comma-separated Better Auth user IDs, server-only). Workspace owners and workspace admins are not platform operators. The admin layout authenticates and checks the allowlist before rendering; each admin API checks it independently. The proxy cookie check is only an early redirect. Mutation origin, rate limits, size limits and audit requirements are preserved. Audit history combines telephony/workspace events with invitation and global-control events.

No new dependencies, schema migration or bridge settings are needed. Deploy the Next.js application after review. Existing operator configuration carries over. Keep secrets and signing-readiness flags server-side.

## Performance

The dashboard replaces seven parallel data endpoints with one private, uncached snapshot endpoint. The server resolves session and membership once, then runs explicitly tenant-scoped queries in parallel. Periodic snapshots contain activity only, at 20-second intervals; they do not reload profile, knowledge, contacts or CRM configuration. App-shell attention also uses one activity endpoint instead of separate calls/inbox requests. Dashboard, attention and mode polling pause when the browser tab is hidden and refresh on return. The voice-session UI is loaded when opened. A first service-worker installation no longer reloads the page; later worker updates wait for the explicit Reload action. Only immutable assets are cached.

Login runs its two independent rate-limit checks in parallel, parses the request clone once, and performs one fresh document navigation after success. This avoids stale prefetched authentication state and a second router refresh. Redirect targets reject external URLs, backslashes and control characters. Private session data is never globally cached. Server errors log operation labels, not raw provider/database messages.

These changes reduce request overhead; production login latency still depends on database region, network and hosting cold starts. No production timing improvement is claimed without deployment measurements.

## Verification

Run build, lint, unit tests and the isolated database/UI integration runner. UI tests seed a disposable platform operator only inside a validated `keralai_test_*` schema; production allowlists are not changed. Coverage includes ordinary-owner denial, admin navigation/legacy redirect, mobile overflow, account drawers, nested dialog Escape behaviour and provider recovery actions.
