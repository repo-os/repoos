/**
 * The Model providers tab used to read a provider key only from RepoOS's
 * `.env`/config, so a provider a harness had already logged into (pi's
 * `auth.json`, opencode's) read as `hasKey: false` (#0676). These pin the
 * read-only fallback into those stores.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  keyFromHarnessStore,
  readProviderKeyFromHarness,
  type HarnessAuthStore,
} from "../../core/providers/harness-auth.js";

const roots: string[] = [];
function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-harness-auth-"));
  roots.push(dir);
  return dir;
}
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

/** Write an auth store with the given records and return its store descriptor. */
function store(records: Record<string, unknown>): HarnessAuthStore {
  const path = join(tmpRoot(), "auth.json");
  writeFileSync(path, JSON.stringify(records), "utf8");
  return { id: "test", path };
}

describe("readProviderKeyFromHarness (#0676)", () => {
  it("reads an API key out of a harness auth store", () => {
    const s = store({ openrouter: { type: "oauth", access: "sk-or-harness" } });
    expect(readProviderKeyFromHarness("openrouter", [s])).toBe("sk-or-harness");
  });

  it("reads the `key` form opencode uses", () => {
    const s = store({ deepinfra: { type: "api", key: "di-harness" } });
    expect(readProviderKeyFromHarness("deepinfra", [s])).toBe("di-harness");
  });

  it("maps opencode-go's own provider name (`opencode`)", () => {
    const s = store({ opencode: { type: "api", key: "zen-harness" } });
    expect(readProviderKeyFromHarness("opencode-go", [s])).toBe("zen-harness");
  });

  it("returns empty for a provider with no harness mapping", () => {
    const s = store({ openrouter: { access: "sk-or-harness" } });
    expect(readProviderKeyFromHarness("cursor", [s])).toBe("");
  });

  it("returns empty when no store has the provider", () => {
    const s = store({ deepinfra: { key: "di-harness" } });
    expect(readProviderKeyFromHarness("openrouter", [s])).toBe("");
  });

  it("is best-effort: missing files and corrupt JSON change nothing", () => {
    const dir = tmpRoot();
    const missing: HarnessAuthStore = { id: "missing", path: join(dir, "nope.json") };
    expect(readProviderKeyFromHarness("openrouter", [missing])).toBe("");
    const badPath = join(dir, "bad.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(badPath, "{ not json", "utf8");
    expect(keyFromHarnessStore("openrouter", badPath)).toBeNull();
  });

  it("ignores an empty secret rather than reporting a key", () => {
    const s = store({ openrouter: { access: "   " } });
    expect(readProviderKeyFromHarness("openrouter", [s])).toBe("");
  });
});
