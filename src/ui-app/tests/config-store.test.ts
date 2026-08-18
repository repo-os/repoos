/**
 * Tests for the config store's settings-persistence wiring (#0240):
 * select fields are coerced to strings on fillForm so an auto-save of an
 * unrelated setting never sends a raw number (which the server rejects), and
 * the sidebar theme switcher keeps `form.uiTheme` in sync with `uiTheme`.
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
  schemaField({ key: "uiTheme", label: "Design theme", type: "select", default: "classic", options: ["classic", "clear", "gen z", "jelly"].map((v) => ({ value: v, label: v })) }),
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
});

describe("fillForm select coercion (#0240)", () => {
  it("stores select values as strings even when the server config has numbers", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 5, uiTheme: "jelly", "whisper.enabled": true, ntfyTopic: "x" }));
    await store.load();
    expect(store.form.maxActiveTasks).toBe("5");
    expect(store.form.uiTheme).toBe("jelly");
  });

  it("auto-saves an unrelated setting with an unchanged select present and succeeds", async () => {
    const store = useConfigStore();
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 5, uiTheme: "classic", "whisper.enabled": false, ntfyTopic: "x" }));
    await store.load();
    // The form now carries a string "5" for maxActiveTasks. Persisting every
    // form field (as buildBody does) must not 400 on the select. We assert the
    // PATCH body is a string, i.e. the value the server accepts.
    let sent: unknown;
    api.mockImplementation(async (_path, opts) => {
      if (opts && String(opts.method) === "PATCH") sent = JSON.parse(String(opts.body));
      return configResponse({ maxActiveTasks: 5, uiTheme: "classic", "whisper.enabled": false, ntfyTopic: "x" });
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
    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, uiTheme: "classic", "whisper.enabled": false, ntfyTopic: "" }));
    await store.load();
    expect(store.form.uiTheme).toBe("classic");

    api.mockResolvedValueOnce(configResponse({ maxActiveTasks: 3, uiTheme: "jelly", "whisper.enabled": false, ntfyTopic: "" }));
    await store.setUiTheme("jelly");

    expect(store.uiTheme).toBe("jelly");
    expect(store.form.uiTheme).toBe("jelly");
  });
});
