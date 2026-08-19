/**
 * Tests for the config store's settings-persistence wiring (#0240):
 * select fields are coerced to strings on fillForm so an auto-save of an
 * unrelated setting never sends a raw number (which the server rejects),
 * and the sidebar theme switcher keeps `form.uiTheme` in sync with `uiTheme`.
 *
 * As of #0254, theme/uiTheme are client-side only (localStorage) and are no
 * longer part of the server config schema.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConfigStore } from "../src/stores/config";
import * as apiMod from "../src/api";
import type { ConfigField } from "../src/types";

const api = vi.spyOn(apiMod, "api");

function schemaField(over: Partial<ConfigField>): ConfigField {
  return {
    key: "k",
    label: "k",
    type: "string",
    tier: "live",
    restartRequired: false,
    group: "",
    default: null,
    description: "",
    options: [],
    ...over,
  } as ConfigField;
}

const SCHEMA: ConfigField[] = [
  schemaField({ key: "maxActiveTasks", label: "Maximum active tasks", type: "select", default: 3, options: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })) }),
  schemaField({ key: "whisper.enabled", label: "Whisper", type: "boolean", default: false }),
  schemaField({ key: "ntfyTopic", label: "ntfy topic", type: "string", default: "" }),
];

function configResponse(config: Record<string, unknown>) {
  return { config, schema: SCHEMA };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("fillForm select coercion (#0240)", () => {
  it("stores select values as strings even when the server config has numbers", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 5, "whisper.enabled": true, ntfyTopic: "x" }));
    await store.load();
    expect(store.form.maxActiveTasks).toBe("5");
  });

  it("auto-saves an unrelated setting with an unchanged select present and succeeds", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 5, "whisper.enabled": false, ntfyTopic: "x" }));
    await store.load();
    // The form now carries a string "5" for maxActiveTasks. Persisting every
    // form field (as buildBody does) must not 400 on the select. We assert the
    // PATCH body is a string, i.e. the value the server accepts.
    let sent: unknown;
    api.mockImplementation(async (_path, opts) => {
      if (opts && String(opts.method) === "PATCH") sent = JSON.parse(String(opts.body));
      return configResponse({ maxActiveTasks: 5, "whisper.enabled": false, ntfyTopic: "x" });
    });
    const body = Object.fromEntries(
      SCHEMA.map((f) => [f.key, store.form[f.key]]),
    );
    await store.save(body as Record<string, unknown>);
    expect(sent).toEqual(expect.objectContaining({ maxActiveTasks: "5" }));
  });
});

describe("setUiTheme keeps form.uiTheme in sync (#0240)", () => {
  it("updates form.uiTheme so the Settings dropdown reflects the sidebar choice", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();
    expect(store.form.uiTheme).toBe("classic");

    await store.setUiTheme("jelly");

    expect(store.uiTheme).toBe("jelly");
    expect(store.form.uiTheme).toBe("jelly");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("jelly");
  });
});

describe("theme/uiTheme localStorage persistence (#0254)", () => {
  it("setTheme writes to localStorage and never calls PATCH /api/config", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();

    let patchCalled = false;
    api.mockImplementation(async (_path, opts) => {
      if (opts && String(opts.method) === "PATCH") patchCalled = true;
      return configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" });
    });

    await store.setTheme("dark");

    expect(localStorage.getItem("repoos.theme")).toBe("dark");
    expect(store.form.theme).toBe("dark");
    expect(patchCalled).toBe(false);
  });

  it("setUiTheme writes to localStorage and never calls PATCH /api/config", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();

    let patchCalled = false;
    api.mockImplementation(async (_path, opts) => {
      if (opts && String(opts.method) === "PATCH") patchCalled = true;
      return configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" });
    });

    await store.setUiTheme("jelly");

    expect(localStorage.getItem("repoos.uiTheme")).toBe("jelly");
    expect(store.form.uiTheme).toBe("jelly");
    expect(patchCalled).toBe(false);
  });

  it("load() reads theme/uiTheme from localStorage, falling back to defaults", async () => {
    const store = useConfigStore();

    // Fresh browser: no localStorage entries → defaults
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();
    expect(store.form.theme).toBe("system");
    expect(store.form.uiTheme).toBe("classic");

    // Set explicit values in localStorage, then reload
    localStorage.setItem("repoos.theme", "dark");
    localStorage.setItem("repoos.uiTheme", "jelly");
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();
    expect(store.form.theme).toBe("dark");
    expect(store.form.uiTheme).toBe("jelly");
  });

  it("switching themes twice in the same session does not leak into repoos.toml", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();

    let lastPatchBody: unknown = null;
    api.mockImplementation(async (_path, opts) => {
      if (opts && String(opts.method) === "PATCH") lastPatchBody = JSON.parse(String(opts.body));
      return configResponse({ maxActiveTasks: 3, "whisper.enabled": false, ntfyTopic: "" });
    });

    await store.setTheme("dark");
    await store.setTheme("light");
    await store.setUiTheme("jelly");
    await store.setUiTheme("clear");

    expect(localStorage.getItem("repoos.theme")).toBe("light");
    expect(localStorage.getItem("repoos.uiTheme")).toBe("clear");
    // The PATCH body (if any) must never contain theme or uiTheme
    if (lastPatchBody) {
      expect(lastPatchBody).not.toHaveProperty("theme");
      expect(lastPatchBody).not.toHaveProperty("uiTheme");
    }
  });
});
