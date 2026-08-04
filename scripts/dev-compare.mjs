// Dev helper: run the new (Vite + Vue 3 SFC) UI and the legacy (app.html) UI
// side-by-side against the SAME repo data so they can be compared manually.
//
//   - Port 7171 (or $NEW_PORT): the built Vite app (dist/ui), same as `ros serve`.
//   - Port 7172 (or $LEGACY_PORT): the legacy src/ui/app.html oracle, served via
//     a tiny static server that proxies /api (incl. SSE) to the new server.
//
// Usage: bun run compare   (both servers stop on Ctrl-C)
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { startServer } from "../dist/server/server.js";

const ROOT = process.cwd();
const NEW_PORT = Number(process.env.NEW_PORT ?? 7171);
const LEGACY_PORT = Number(process.env.LEGACY_PORT ?? 7172);

const legacyDir = resolve(ROOT, "src/ui");
const appHtml = resolve(legacyDir, "app.html");
if (!existsSync(appHtml)) {
  console.error(`legacy UI not found at ${appHtml}; run from the repo root`);
  process.exit(1);
}

// ---- new UI server (same as `ros serve`) ----
const newServer = await startServer({ root: ROOT, host: "127.0.0.1", port: NEW_PORT });

// ---- legacy UI server: static files + reverse proxy to the new server ----
const staticFiles = new Map([
  ["/", { file: appHtml, type: "text/html; charset=utf-8" }],
  ["/favicon.svg", { file: resolve(legacyDir, "favicon.svg"), type: "image/svg+xml" }],
  ["/vendor/vue.global.prod.js", { file: resolve(legacyDir, "vendor/vue.global.prod.js"), type: "application/javascript" }],
]);

const legacyServer = http.createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const hit = staticFiles.get(path);
  if (hit && req.method === "GET") {
    res.writeHead(200, { "Content-Type": hit.type });
    res.end(readFileSync(hit.file));
    return;
  }
  // Everything else (API, docs, SSE) → the new server, streamed unmodified.
  const upstream = http.request(
    new URL(req.url, `http://127.0.0.1:${NEW_PORT}`),
    { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${NEW_PORT}` } },
    (upRes) => {
      res.writeHead(upRes.statusCode, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("proxy error: new UI server not reachable");
  });
  req.on("error", () => upstream.destroy());
  req.pipe(upstream);
});

await new Promise((r) => legacyServer.listen(LEGACY_PORT, "127.0.0.1", r));

console.log("");
console.log("  RepoOS UI comparison — same repo, live data on both:");
console.log("");
console.log(`    New UI   (Vite + Vue 3 SFC): http://127.0.0.1:${NEW_PORT}`);
console.log(`    Legacy UI (app.html oracle): http://127.0.0.1:${LEGACY_PORT}`);
console.log("");
console.log("  Ctrl-C stops both servers.");
console.log("");

const stop = async () => {
  legacyServer.close();
  await newServer.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
