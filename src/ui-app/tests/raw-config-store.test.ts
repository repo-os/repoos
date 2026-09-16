/**
 * Raw repoos.toml editor state in the config store (#0375). Covers the two
 * consistency guarantees: saving the raw text reloads the curated form from
 * the new file, and a curated-field save refreshes the raw editor only when
 * it has no pending edits of its own (so a raw draft is never silently
 * overwritten — the next raw save then hits the server's 409 instead).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore } from "../src/stores/config";
import * as apiMod from "../src/api";
import { ApiError } from "../src/api";
import type { ConfigField } from "../src/types";

const api = vi.spyOn(apiMod, "api");

const SCHEMA: ConfigField[] = [
  {
    key: "maxActiveTasks",
    label: "Max",
    type: "select",
    tier: "live",
    restartRequired: false,
    group: "general",
    default: 3,
    description: "",
    options: [{ value: "3", label: "3" }],
  } as ConfigField,
  {
    key: "strictBuild",
    label: "Strict build",
    type: "boolean",
    tier: "restart",
    restartRequired: true,
    group: "general",
    default: false,
    description: "",
  } as ConfigField,
];

function configResponse(
  config: Record<string, unknown> = { maxActiveTasks: 3, strictBuild: false },
) {
  return { config, schema: SCHEMA };
}

describe("raw repoos.toml store (#0375)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  });

  afterEach(() => {
    api.mockReset();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("loadRaw populates the draft, content and hash", async () => {
    api.mockResolvedValueOnce({ content: "a = 1\n", hash: "h1" });
    const store = useConfigStore();
    await store.loadRaw();
    expect(store.rawLoaded).toBe(true);
    expect(store.rawContent).toBe("a = 1\n");
    expect(store.rawHash).toBe("h1");
    expect(store.rawDraft).toBe("a = 1\n");
    expect(store.rawDirty).toBe(false);
  });

  it("tolerates a non-raw response shape without throwing", async () => {
    api.mockResolvedValueOnce(configResponse());
    const store = useConfigStore();
    await store.loadRaw();
    expect(store.rawContent).toBe("");
    expect(store.rawDraft).toBe("");
    expect(store.rawError).toBe("");
  });

  it("saveRaw PUTs content + baseHash and reloads the curated form", async () => {
    let putBody: unknown;
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        if (opts?.method === "PUT") {
          putBody = JSON.parse(String(opts.body));
          return { ok: true, content: "a = 2\n", hash: "h2" };
        }
        return { content: "a = 1\n", hash: "h1" };
      }
      return configResponse();
    });
    const store = useConfigStore();
    await store.loadRaw();
    store.rawDraft = "a = 2\n";
    await store.saveRaw();

    expect(putBody).toEqual({ content: "a = 2\n", baseHash: "h1" });
    expect(store.rawContent).toBe("a = 2\n");
    expect(store.rawHash).toBe("h2");
    expect(store.rawDirty).toBe(false);
    expect(store.msg).toMatch(/saved/);
  });

  it("saveRaw surfaces a server rejection and keeps the draft", async () => {
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        if (opts?.method === "PUT") throw new Error("Invalid TOML on line 3: bad value");
        return { content: "a = 1\n", hash: "h1" };
      }
      return configResponse();
    });
    const store = useConfigStore();
    await store.loadRaw();
    store.rawDraft = "a = oops\n";
    await store.saveRaw();

    expect(store.rawError).toMatch(/Invalid TOML on line 3/);
    expect(store.rawDraft).toBe("a = oops\n");
    expect(store.rawContent).toBe("a = 1\n");
  });

  it("a curated save does not clobber a dirty raw draft", async () => {
    const rawGets: string[] = [];
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        rawGets.push("get");
        return { content: "a = 1\n", hash: "h1" };
      }
      if (path === "/api/config") return configResponse();
      return configResponse();
    });
    const store = useConfigStore();
    await store.loadRaw();
    store.rawDraft = "a = 999\n";

    await store.save({ maxActiveTasks: 3 });

    // Only the initial explicit load; the post-save refresh was skipped.
    expect(rawGets).toHaveLength(1);
    expect(store.rawDraft).toBe("a = 999\n");
  });

  it("a curated save refreshes a clean raw draft", async () => {
    const rawGets: string[] = [];
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        rawGets.push("get");
        return { content: "a = 1\n", hash: "h1" };
      }
      return configResponse();
    });
    const store = useConfigStore();
    await store.loadRaw();

    await store.save({ maxActiveTasks: 3 });

    expect(rawGets).toHaveLength(2);
  });

  it("keeps keystrokes typed while a raw save is in flight", async () => {
    let store: ReturnType<typeof useConfigStore>;
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        if (opts?.method === "PUT") {
          // The user keeps typing before the response lands.
          store.rawDraft = "a = 3\n";
          return { ok: true, content: "a = 2\n", hash: "h2" };
        }
        return { content: "a = 1\n", hash: "h1" };
      }
      return configResponse();
    });
    store = useConfigStore();
    await store.loadRaw();
    store.rawDraft = "a = 2\n";
    await store.saveRaw();

    expect(store.rawDraft).toBe("a = 3\n");
    expect(store.rawContent).toBe("a = 2\n");
    expect(store.rawDirty).toBe(true);
  });

  it("a 409 adopts the server's content/hash but keeps the draft for an explicit overwrite", async () => {
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        if (opts?.method === "PUT") {
          throw new ApiError("repoos.toml changed on disk", 409, {
            content: "a = 9\n",
            hash: "h9",
          });
        }
        return { content: "a = 1\n", hash: "h1" };
      }
      return configResponse();
    });
    const store = useConfigStore();
    await store.loadRaw();
    store.rawDraft = "a = 2\n";
    await store.saveRaw();

    expect(store.rawError).toMatch(/changed on disk/);
    expect(store.rawError).toMatch(/Save again to overwrite/);
    expect(store.rawContent).toBe("a = 9\n");
    expect(store.rawHash).toBe("h9");
    expect(store.rawDraft).toBe("a = 2\n");
    expect(store.rawDirty).toBe(true);
  });

  it("reports a restart when a raw save changes a restart-tier field", async () => {
    let strictBuild = false;
    api.mockImplementation(async (path, opts) => {
      if (path === "/api/config/raw") {
        if (opts?.method === "PUT") {
          strictBuild = true;
          return { ok: true, content: "strictBuild = true\n", hash: "h2" };
        }
        return { content: "strictBuild = false\n", hash: "h1" };
      }
      return configResponse({ maxActiveTasks: 3, strictBuild });
    });
    const store = useConfigStore();
    await store.load();
    await store.loadRaw();
    store.rawDraft = "strictBuild = true\n";
    await store.saveRaw();

    expect(store.msg).toMatch(/restart server to apply/);
  });
});
