/**
 * Read provider API keys out of the coding agents' own auth stores (#0676).
 *
 * The Model providers tab only ever looked in RepoOS's `.env` and config, so a
 * key that lives in a harness's login store — e.g. pi's `auth.json`, or
 * opencode's — read as `hasKey: false` even though that harness was already
 * using the provider successfully. This closes that gap: for a provider row,
 * fall back to the well-known auth stores when RepoOS has no key of its own.
 *
 * Deliberately read-only and best-effort: a missing/corrupt store changes
 * nothing, and the raw key is never logged or echoed back — callers only ever
 * see a boolean or use it for one upstream request. Zero runtime dependencies,
 * same rule as the rest of `providers/`.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * One harness auth store: a JSON file whose keys are provider ids and whose
 * values carry the secret under `key` (API tokens) or `access` (OAuth records).
 */
export interface HarnessAuthStore {
  /** Stable id, surfaced only in tests/debugging. */
  id: string;
  /** Absolute path to the JSON auth file. */
  path: string;
}

/**
 * Provider-id aliases a harness may use for a given RepoOS provider row. A
 * harness store is keyed by ITS OWN provider name, which does not always match
 * the registry id (`opencode-go` is opencode's `opencode`, for instance).
 */
const HARNESS_PROVIDER_ALIASES: Record<string, string[]> = {
  openrouter: ["openrouter"],
  deepinfra: ["deepinfra"],
  "opencode-go": ["opencode-go", "opencode"],
};

/** The auth stores checked, in order, when RepoOS has no key of its own. */
function defaultAuthStores(): HarnessAuthStore[] {
  const home = homedir();
  const dataHome = process.env.XDG_DATA_HOME || join(home, ".local", "share");
  return [
    // opencode's login store (XDG data dir).
    { id: "opencode", path: join(dataHome, "opencode", "auth.json") },
    // pi's login store.
    { id: "pi", path: join(home, ".pi", "agent", "auth.json") },
    // Codex stores an API key in its own auth file; harmless to include.
    { id: "codex", path: join(home, ".codex", "auth.json") },
  ];
}

/** A non-empty string secret from a parsed auth record, or null. */
function secretFromRecord(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const rec = value as Record<string, unknown>;
  for (const field of ["key", "access", "apiKey", "api_key"]) {
    const v = rec[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Look up `providerId`'s secret in one auth file. Returns null on any failure
 * (missing file, bad JSON, no matching entry) — never throws.
 */
export function keyFromHarnessStore(providerId: string, storePath: string): string | null {
  try {
    if (!existsSync(storePath)) return null;
    const parsed: unknown = JSON.parse(readFileSync(storePath, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    return secretFromRecord((parsed as Record<string, unknown>)[providerId]);
  } catch {
    return null;
  }
}

/**
 * Find a RepoOS provider row's key in the harness auth stores, or "" when no
 * store has one. `stores` is injectable for tests; production uses the
 * well-known locations. Read-only and best-effort.
 */
export function readProviderKeyFromHarness(
  providerId: string,
  stores: HarnessAuthStore[] = defaultAuthStores(),
): string {
  const aliases = HARNESS_PROVIDER_ALIASES[providerId];
  if (!aliases) return "";
  for (const store of stores) {
    for (const alias of aliases) {
      const key = keyFromHarnessStore(alias, store.path);
      if (key) return key;
    }
  }
  return "";
}
