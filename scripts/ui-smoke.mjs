#!/usr/bin/env node
/**
 * RepoOS's own UI smoke test, declared as this repo's `smoke` package.json
 * script so `repoos check` runs it through the same per-project opt-in every
 * managed project uses (#0348), with no RepoOS-only branch in check.ts.
 *
 *   bun run smoke    (expects a fresh build; `repoos check` builds first)
 *
 * Boots the BUILT app (dist/ui) against a throwaway fixture repo and drives it
 * with headless WebKit. Exits 0 on pass, or when Playwright/WebKit isn't
 * installed (skip); 1 on failure.
 */
import { existsSync } from "node:fs";

const entry = new URL("../dist/commands/ui-smoke.js", import.meta.url);
if (!existsSync(entry)) {
  console.error("dist/commands/ui-smoke.js not found. Run `bun run build` first.");
  process.exit(1);
}

const { cmdUISmoke } = await import(entry.href);
process.exit(await cmdUISmoke());
