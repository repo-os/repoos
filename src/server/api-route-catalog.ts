/**
 * Last HTTP route table registered by a running server — used by the CLI/API
 * parity test so new routes cannot land without a CLI command or allowlist entry.
 */
import type { Router } from "./routes/router.js";

let catalog: Array<{ method: string; pattern: string }> = [];

export function recordApiRouteCatalog(router: Router): void {
  catalog = router.listRoutes();
}

export function getApiRouteCatalog(): ReadonlyArray<{ method: string; pattern: string }> {
  return catalog;
}

/** Test-only: reset when no server has booted in this process yet. */
export function clearApiRouteCatalogForTests(): void {
  catalog = [];
}
