/**
 * Fullscreen diff view Escape-to-back (#0517).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import * as apiMod from "../src/api";
import DiffView from "../src/views/DiffView.vue";

const api = vi.spyOn(apiMod, "api");
let canvasSpy: ReturnType<typeof vi.spyOn>;

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " line",
  "+added",
  "",
].join("\n");

async function mountDiffView(): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div>home</div>" } },
      { path: "/tasks/:taskId/diff", name: "diff", component: DiffView },
    ],
  });
  await router.push("/");
  await router.push({ name: "diff", params: { taskId: "0517" }, query: { file: "src/a.ts" } });
  await router.isReady();
  const wrapper = mount(DiffView, { global: { plugins: [pinia, router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  api.mockImplementation(async (path: string) => {
    if (path.endsWith("/diff")) {
      return { ok: true, diff: { patch: PATCH, truncated: false } };
    }
    if (path.includes("/file?")) {
      return { content: "line\nadded\n" };
    }
    throw new Error(`unexpected api call: ${path}`);
  });
  canvasSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  canvasSpy.mockRestore();
  api.mockReset();
});

describe("DiffView Escape to back (#0517)", () => {
  it("shows an esc hint beside the Back button", async () => {
    const { wrapper } = await mountDiffView();
    const hint = wrapper.find(".diff-back-esc-hint");
    expect(hint.exists()).toBe(true);
    expect(hint.text()).toBe("esc");
    wrapper.unmount();
  });

  it("navigates back on Escape via router.back()", async () => {
    const { wrapper, router } = await mountDiffView();
    const backSpy = vi.spyOn(router, "back");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(backSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("does not navigate back on Escape when an editable field has focus", async () => {
    const { wrapper, router } = await mountDiffView();
    const backSpy = vi.spyOn(router, "back");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(backSpy).not.toHaveBeenCalled();
    input.remove();
    wrapper.unmount();
  });

  it("removes the Escape listener on unmount", async () => {
    const { wrapper, router } = await mountDiffView();
    const backSpy = vi.spyOn(router, "back");
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(backSpy).not.toHaveBeenCalled();
  });
});
