/**
 * Settings Import/Export tab (#0779): the export card downloads the selected
 * sections as a `repoos_<repo>_export_<timestamp>.toml` file through the
 * browser's normal download, and the import card applies a dropped/selected
 * export file to the current project (server settings via PATCH, favorites
 * via localStorage) after a review step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useConfigStore } from "../src/stores/config";
import * as apiMod from "../src/api";
import SettingsImportExport from "../src/components/SettingsImportExport.vue";
import { serializeSettingsExport } from "../src/lib/settings-transfer";

const api = vi.spyOn(apiMod, "api");

function configResponse() {
  return {
    config: {
      "budget.allowlist": [{ cli: "opencode", models: ["model-a"] }],
      remoteValidation: { enabled: true, provider: "tailscale" },
    },
    schema: [],
  };
}

async function loadConfig() {
  api.mockImplementation(async () => configResponse() as never);
  const config = useConfigStore();
  await config.load();
  api.mockReset();
  return config;
}

function mountTab() {
  return mount(SettingsImportExport);
}

/** Push a File through the hidden picker input, as a user browse would. */
async function pickFile(wrapper: ReturnType<typeof mount>, file: File): Promise<void> {
  const input = wrapper.find('input[type="file"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await vi.waitFor(() => {
    const t = wrapper.text();
    if (!t.includes("review before applying") && !t.includes("No importable settings found")) {
      throw new Error("waiting for the import review step");
    }
  });
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

describe("export card", () => {
  it("offers all five sections, selected by default", async () => {
    await loadConfig();
    const wrapper = mountTab();
    await nextTick();
    const labels = wrapper.findAll(".setting-label").map((el) => el.text());
    expect(labels).toEqual([
      "Agent+Model allowlist",
      "Agent+Model favorites",
      "Starred coding agents",
      "Starred themes",
      "Remote validation",
    ]);
    const download = wrapper.findAll("button").find((b) => b.text().includes("Download"));
    expect(download?.attributes("disabled")).toBeUndefined();
  });

  it("disables the download until at least one section is selected", async () => {
    await loadConfig();
    const wrapper = mountTab();
    await nextTick();
    // Uncheck everything through the five switches.
    for (const sw of wrapper.findAll(".setting-input button")) {
      await sw.trigger("click");
    }
    await nextTick();
    const download = wrapper.findAll("button").find((b) => b.text().includes("Download"));
    expect(download?.attributes("disabled")).toBeDefined();
  });

  it("downloads the selected sections as repoos_<repo>_export_<timestamp>.toml", async () => {
    await loadConfig();
    localStorage.setItem(
      "agent-model-favorites",
      JSON.stringify([{ cli: "opencode", model: "model-a", addedAt: 1 }]),
    );
    localStorage.setItem("agent-cli-favorites", JSON.stringify(["opencode"]));

    let capturedBlob: Blob | null = null;
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return "blob:mock";
      }),
      revokeObjectURL: vi.fn(),
    });
    let downloadedName = "";
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        downloadedName = this.download;
      });

    const wrapper = mountTab();
    await nextTick();
    const download = wrapper.findAll("button").find((b) => b.text().includes("Download"))!;
    await download.trigger("click");
    await nextTick();

    expect(downloadedName).toMatch(/^repoos_repo_export_\d{8}-\d{6}\.toml$/);
    expect(capturedBlob).not.toBeNull();
    const text = await capturedBlob!.text();
    expect(text).toContain("[[budget.allowlist]]");
    expect(text).toContain("[remoteValidation]");
    expect(text).toContain("[[agentModelFavorites]]");
    expect(text).toContain("[starredAgents]");
    expect(text).toContain("[starredThemes]");
    expect(wrapper.text()).toContain("check your Downloads folder");
    clickSpy.mockRestore();
  });
});

describe("import card", () => {
  const EXPORT_TOML = serializeSettingsExport(
    {
      budgetAllowlist: [{ cli: "opencode", models: ["model-a", "model-b"] }],
      agentModelFavorites: [{ cli: "opencode", model: "model-a", addedAt: 7 }],
      starredAgents: ["opencode"],
      starredThemes: ["jelly"],
      remoteValidation: { enabled: true, provider: "tailscale", maxConcurrent: 2 },
    },
    { repo: "other", exportedAt: "2026-10-14T08:00:00.000Z" },
  );

  it("reviews a picked file before applying anything", async () => {
    await loadConfig();
    const wrapper = mountTab();
    await nextTick();

    await pickFile(wrapper, new File([EXPORT_TOML], "repoos_other_export_20261014-080000.toml"));

    expect(wrapper.text()).toContain("review before applying");
    expect(wrapper.text()).toContain("Agent+Model allowlist");
    expect(wrapper.text()).toContain("1 row");
    expect(wrapper.text()).toContain("Remote validation");
    // Nothing applied yet: no PATCH, no storage writes.
    expect(api).not.toHaveBeenCalled();
    expect(localStorage.getItem("agent-cli-favorites")).toBeNull();
  });

  it("applies server settings via PATCH and favorites via localStorage", async () => {
    const config = await loadConfig();
    const patched: Record<string, unknown>[] = [];
    api.mockImplementation(async (_path: string, opts?: RequestInit) => {
      if ((opts as { method?: string } | undefined)?.method === "PATCH") {
        patched.push(JSON.parse((opts as { body: string }).body as string));
        return { ok: true } as never;
      }
      return configResponse() as never;
    });

    const wrapper = mountTab();
    await nextTick();
    await pickFile(wrapper, new File([EXPORT_TOML], "export.toml"));

    const apply = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Apply to this project"))!;
    await apply.trigger("click");
    await vi.waitFor(() => {
      if (!wrapper.text().includes("Applied")) throw new Error("waiting for the apply result");
    });

    expect(patched).toHaveLength(1);
    expect(patched[0]).toEqual({
      "budget.allowlist": [{ cli: "opencode", models: ["model-a", "model-b"] }],
      "remoteValidation.enabled": true,
      "remoteValidation.provider": "tailscale",
      "remoteValidation.maxConcurrent": "2",
    });
    expect(JSON.parse(localStorage.getItem("agent-model-favorites") ?? "[]")).toEqual([
      { cli: "opencode", model: "model-a", addedAt: 7 },
    ]);
    expect(JSON.parse(localStorage.getItem("agent-cli-favorites") ?? "[]")).toEqual(["opencode"]);
    expect(JSON.parse(localStorage.getItem("repoos.favoriteThemes") ?? "[]")).toEqual(["jelly"]);
    expect(config.favoriteThemes).toEqual(["jelly"]);
    expect(wrapper.text()).toContain("Applied");
  });

  it("rejects a non-export file with guidance, applying nothing", async () => {
    await loadConfig();
    const wrapper = mountTab();
    await nextTick();

    await pickFile(wrapper, new File(["hello world"], "notes.txt"));

    expect(wrapper.text()).toContain("No importable settings found");
    expect(wrapper.text()).not.toContain("review before applying");
    expect(api).not.toHaveBeenCalled();
  });

  it("accepts a dropped file the same way as a picked one", async () => {
    await loadConfig();
    const wrapper = mountTab();
    await nextTick();

    const zone = wrapper.find(".ie-dropzone").element;
    const event = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", {
      value: { files: [new File([EXPORT_TOML], "export.toml")] },
    });
    zone.dispatchEvent(event);
    await vi.waitFor(() => {
      if (!wrapper.text().includes("review before applying")) {
        throw new Error("waiting for the dropped-file review step");
      }
    });

    expect(wrapper.text()).toContain("review before applying");
  });

  it("surfaces a failed PATCH and writes no local favorites", async () => {
    await loadConfig();
    api.mockRejectedValue(new Error("containerImage must be a non-empty string"));
    const wrapper = mountTab();
    await nextTick();
    await pickFile(wrapper, new File([EXPORT_TOML], "export.toml"));

    const apply = wrapper
      .findAll("button")
      .find((b) => b.text().includes("Apply to this project"))!;
    await apply.trigger("click");
    await vi.waitFor(() => {
      if (!wrapper.find(".ff-error").exists()) throw new Error("waiting for the apply error");
    });

    expect(wrapper.text()).toContain("containerImage must be a non-empty string");
    expect(localStorage.getItem("agent-cli-favorites")).toBeNull();
    expect(localStorage.getItem("agent-model-favorites")).toBeNull();
  });
});
