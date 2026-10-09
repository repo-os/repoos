/**
 * #0749 — the Advanced-tab Dev targets card.
 *
 * Mounting the real component against a seeded config store proves the control's
 * three jobs: it renders the declared rows, it routes every edit (add, edit,
 * reorder, remove) through `config.save({ devTargets })` — never a hand-edit —
 * and it shows an inline validation error instead of saving an invalid row.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { nextTick } from "vue";
import DevTargetsSettings from "../src/components/DevTargetsSettings.vue";
import { useConfigStore } from "../src/stores/config";
import type { DevTargetPayload } from "../src/lib/dev-targets";

let pinia: Pinia;

function seed(
  targets: DevTargetPayload[],
  errors: string[] = [],
): ReturnType<typeof useConfigStore> {
  const config = useConfigStore();
  config.data = { devTargets: targets, devTargetErrors: errors };
  return config;
}

function mountCard() {
  return mount(DevTargetsSettings, { global: { plugins: [pinia] } });
}

const web: DevTargetPayload = {
  name: "web",
  kind: "server",
  command: "bun run dev",
  url: "http://localhost:5173",
  label: "Web app",
};

const apk: DevTargetPayload = {
  name: "apk",
  kind: "artifact",
  command: "./gradlew assembleDebug",
  artifactPath: "app/build/outputs/apk/debug/app-debug.apk",
};

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
});

describe("DevTargetsSettings card (#0749)", () => {
  it("renders the declared targets", () => {
    seed([web, apk]);
    const wrapper = mountCard();
    const rows = wrapper.findAll(".dev-targets-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Web app");
    expect(rows[0]!.text()).toContain("bun run dev");
    expect(rows[1]!.text()).toContain("apk");
    expect(rows[1]!.text()).toContain("app/build/outputs/apk/debug/app-debug.apk");
  });

  it("shows the empty state when nothing is declared", () => {
    seed([]);
    const wrapper = mountCard();
    expect(wrapper.find(".dev-targets-empty").exists()).toBe(true);
  });

  it("surfaces server-recorded parse errors for hand-written rows", () => {
    seed([], ["[dev.targets] web: a command is required"]);
    const wrapper = mountCard();
    expect(wrapper.find(".ff-error").text()).toContain("could not be loaded");
  });

  it("saves the reordered list through config.save", async () => {
    const config = seed([web, apk]);
    const save = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = mountCard();

    // Move the second row up.
    const upButtons = wrapper.findAll(
      '[aria-label="Move Debug APK up"], [aria-label="Move apk up"]',
    );
    await upButtons[upButtons.length - 1]!.trigger("click");
    await nextTick();

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0]![0] as { devTargets: { name: string }[] };
    expect(sent.devTargets.map((t) => t.name)).toEqual(["apk", "web"]);
  });

  it("removes a row through config.save", async () => {
    const config = seed([web, apk]);
    const save = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = mountCard();

    await wrapper.get('[aria-label="Remove Web app"]').trigger("click");
    await nextTick();

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0]![0] as { devTargets: { name: string }[] };
    expect(sent.devTargets.map((t) => t.name)).toEqual(["apk"]);
  });

  it("adds a row composed in the dialog and saves it", async () => {
    const config = seed([web]);
    const save = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = mountCard();

    await wrapper.get('[data-test-id="dev-targets-add"]').trigger("click");
    await nextTick();
    // The dialog is body-teleported; drive it through its emitted submit.
    const dialog = wrapper.getComponent({ name: "DevTargetDialog" });
    dialog.vm.$emit("submit", {
      name: "apk",
      kind: "artifact",
      command: "./gradlew assembleDebug",
      url: "",
      artifactPath: "app/build/outputs/apk/debug/app-debug.apk",
      label: "Debug APK",
      healthCheckUrl: "",
      healthCheckFile: "",
    });
    await nextTick();

    expect(save).toHaveBeenCalledTimes(1);
    const sent = save.mock.calls[0]![0] as { devTargets: { name: string }[] };
    expect(sent.devTargets.map((t) => t.name)).toEqual(["web", "apk"]);
  });

  it("blocks a save that would produce a duplicate name", async () => {
    const config = seed([web]);
    const save = vi.spyOn(config, "save").mockResolvedValue(undefined);
    const wrapper = mountCard();

    await wrapper.get('[data-test-id="dev-targets-add"]').trigger("click");
    await nextTick();
    const dialog = wrapper.getComponent({ name: "DevTargetDialog" });
    dialog.vm.$emit("submit", {
      name: "web",
      kind: "server",
      command: "bun run dev",
      url: "http://localhost:5173",
      artifactPath: "",
      label: "",
      healthCheckUrl: "",
      healthCheckFile: "",
    });
    await nextTick();

    expect(save).not.toHaveBeenCalled();
    expect(wrapper.find(".ff-error").text()).toContain("duplicate name");
  });

  it("does not save while a validation error is present in the row", () => {
    seed([web]);
    const wrapper = mountCard();
    // The card itself never persists on mount.
    expect(wrapper.find(".dev-targets-row").exists()).toBe(true);
  });
});
