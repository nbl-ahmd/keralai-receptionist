/*
 * public/sw.js
 *
 * Minimal service worker for the KeralAI dashboard.
 *
 * Scope of caching is deliberately narrow:
 *   - Only same-origin GET requests for immutable build assets and icons.
 *   - Never caches /api/* (authenticated JSON), WebSocket traffic, or HTML.
 *
 * This keeps the PWA installable and fast to reload without ever serving one
 * tenant's data to another, or a stale authenticated page after logout.
 */

const STATIC_CACHE = "keralai-static-v1";
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url, request) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Never intercept WebSocket upgrades, POSTs, or API calls.
  if (!isStaticAsset(url, request)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      } catch (error) {
        if (cached) return cached;
        throw error;
      }
    })(),
  );
});