#!/usr/bin/env node
/**
 * Serve the BUILT app (dist/ui) against a throwaway COPY of
 * `scripts/screenshot-fixtures`, with auth forced off (see
 * `startPreviewServer`'s `disableAuth`).
 *
 *   bun run build:ui && bun run dev:preview
 *
 * For manually poking at UI changes in a browser without fighting the login
 * screen on your real `repoos serve` instance, and without a second
 * watcher/runner/supervisor competing with it over your real work/. Your
 * real repoos.toml and work/ are never read or written. Prints the URL and
 * stays alive until Ctrl-C; cleans up its tmp fixture copy on exit.
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startPreviewServer } from "../dist/commands/ui-harness.js";

const ROOT = process.cwd();
const FIXTURES = resolve(ROOT, "scripts/screenshot-fixtures");

if (!existsSync(FIXTURES)) {
  console.error(`Missing fixture repo: ${FIXTURES}`);
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "repoos-dev-preview-"));
cpSync(FIXTURES, tmp, { recursive: true });

let server;
try {
  server = await startPreviewServer(tmp);
} catch (e) {
  console.error("Failed to start server:", e);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

console.log(`Dev preview (auth disabled, fixture data) running at ${server.url}`);
console.log("Press Ctrl-C to stop.");

function shutdown() {
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
