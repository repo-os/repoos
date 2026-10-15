/**
 * #0796 — CTO safe actions: empty allowlist + Settings checkboxes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { reactive } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { getConfigSchema, loadConfig } from "../../core/config.js";
import { assertKnownCtoSafeActionIds } from "../../core/cto-actions.js";
import { patchConfig } from "../../server/routes/config.js";
import * as apiMod from "../src/api";
import { useConfigStore } from "../src/stores/config";
import SettingsView from "../src/views/SettingsView.vue";
import CtoSafeActionsSettings from "../src/components/CtoSafeActionsSettings.vue";

const api = vi.spyOn(apiMod, "api");

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead(code: number): unknown;
    end(payload: string): void;
  } = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
    logger: { system() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

function repo(toml: string): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-cto-actions-patch-"));
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}

describe("PATCH /api/config cto.actions (#0796)", () => {
  it("accepts an empty allowlist (report-only)", async () => {
    const root = repo('cto.actions = ["restart-stalled-agent"]\n');
    try {
      const res = await patch(root, { "cto.actions": [] });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain("cto.actions = []");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unknown action names", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, { "cto.actions": ["not-a-real-action"] });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain("Unknown CTO safe action");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("persists a selected allowlist", async () => {
    const root = repo('workDir = "work"\n');
    try {
      const res = await patch(root, {
        "cto.actions": ["refresh-main-install", "kill-hung-validation"],
      });
      expect(res.status).toBe(200);
      const cfg = loadConfig(root);
      expect(cfg.cto?.actions).toEqual(["refresh-main-install", "kill-hung-validation"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("cto.actions schema helpers (#0796)", () => {
  it("documents every action in getConfigSchema", () => {
    const field = getConfigSchema().find((f) => f.key === "cto.actions");
    expect(field?.description).toContain("report-only");
    expect(field?.description).toContain("kill-hung-validation");
    expect(field?.description).toContain("stops the validation container");
  });

  it("assertKnownCtoSafeActionIds flags unknown ids", () => {
    expect(assertKnownCtoSafeActionIds(["restart-stalled-agent"])).toBeNull();
    expect(assertKnownCtoSafeActionIds(["bogus"])).toBe("bogus");
  });
});

const routeState = reactive<{ query: Record<string, string | string[]> }>({ query: {} });

vi.mock("vue-router", () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

function settingsConfigResponse(actions: string[] = ["restart-stalled-agent"]) {
  const ctoField = getConfigSchema().find((f) => f.key === "cto.actions")!;
  const skipField = getConfigSchema().find((f) => f.key === "ctoSkipHealthy")!;
  return {
    config: {
      maxActiveTasks: 3,
      ctoSkipHealthy: true,
      cto: { actions },
    },
    schema: [skipField, ctoField],
  };
}

async function mountCtoSettings(actions: string[] = ["restart-stalled-agent"]) {
  api.mockResolvedValue(settingsConfigResponse(actions));
  await useConfigStore().load();
  routeState.query = { tab: "general" };
  const wrapper = mount(SettingsView, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: false }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
  (Element.prototype as unknown as Record<string, unknown>).scrollIntoView = vi.fn();
});

afterEach(() => {
  api.mockReset();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("Settings CTO safe actions checkboxes (#0796)", () => {
  it("renders one checkbox per action with the kill warning", async () => {
    const wrapper = await mountCtoSettings();
    const row = document.getElementById("setting-cto.actions");
    expect(row).not.toBeNull();
    expect(row!.querySelectorAll("button[role='checkbox']").length).toBe(4);
    expect(row!.textContent).toContain("stops the validation container");
    wrapper.unmount();
  });

  it("auto-save sends the updated allowlist when a box is toggled", async () => {
    const config = useConfigStore();
    const saveSpy = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = await mountCtoSettings(["restart-stalled-agent", "refresh-main-install"]);
    const row = document.getElementById("setting-cto.actions")!;
    const restartBox = row.querySelectorAll("button[role='checkbox']")[0] as HTMLButtonElement;
    await new DOMWrapper(restartBox).trigger("click");
    await flushPromises();
    await vi.waitFor(() => expect(saveSpy).toHaveBeenCalled(), { timeout: 3000 });
    const body = saveSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(body["cto.actions"]).toEqual(["refresh-main-install"]);
    saveSpy.mockRestore();
    wrapper.unmount();
  });

  it("fillForm keeps cto.actions as a string array after reload", async () => {
    api.mockResolvedValue(settingsConfigResponse([]));
    const config = useConfigStore();
    await config.load();
    expect(config.form["cto.actions"]).toEqual([]);
  });
});

describe("CtoSafeActionsSettings component (#0796)", () => {
  it("emits canonical action order when multiple boxes are checked", async () => {
    const selected = reactive<string[]>([]);
    const wrapper = mount(CtoSafeActionsSettings, {
      props: {
        modelValue: selected,
        "onUpdate:modelValue": (v: string[]) => {
          selected.splice(0, selected.length, ...v);
        },
      },
    });
    const boxes = wrapper.findAll("button[role='checkbox']");
    await boxes[2]!.trigger("click");
    await boxes[0]!.trigger("click");
    expect([...selected]).toEqual(["restart-stalled-agent", "requeue-closeout-after-env-fix"]);
    wrapper.unmount();
  });
});
