/**
 * The service worker's source, generated at build time by vite.config.ts.
 *
 * What it serves from its cache, and why:
 * - `/assets/*` is content-hashed build output. A changed file gets a new
 *   name, so a stored copy can never be stale: cache-first, and only
 *   successful responses are stored.
 * - Page navigations go to the network first. The cached shell is only a
 *   fallback for when the network is unreachable.
 * - Everything else is not intercepted: `/api/`, repo docs (`/docs/*.md`,
 *   `/AGENTS.md`, `/README.md`), attachments, and `sw.js` itself always come
 *   from the server.
 *
 * It used to serve every same-origin non-`/api` GET cache-first, so an edited
 * or newly written doc kept showing its first-fetched version until the next
 * UI build rotated the cache name. Verified 2026-09-15 with a probe doc: after
 * the file on disk said v2, the page still got v1, even with
 * `cache: "reload"`.
 *
 * vite.config.ts hashes this whole source (precache list included) into the
 * cache name, so a change to the worker's logic rotates the cache too and the
 * activate step deletes whatever older workers stored.
 */
export function serviceWorkerSource(precache: readonly string[], cacheName: string): string {
  return `const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((hit) => hit || Response.error())),
    );
    return;
  }
  // Only content-hashed build output is immutable. Repo docs, attachments,
  // the API and sw.js must always come from the server.
  if (!url.pathname.startsWith("/assets/")) return;
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}
