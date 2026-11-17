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

const SHA = "a".repeat(40);

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1 +1,2 @@",
  " line",
  "+added",
  "",
].join("\n");

/** Every route the shared DiffView serves (#1151). */
const DIFF_ROUTES = [
  { label: "task diff", path: "/tasks/1151/diff" },
  { label: "conflict diff", path: "/tasks/1151/conflict-diff" },
  { label: "repo working diff", path: "/repo/working-diff" },
  { label: "commit diff", path: `/repo/commits/${SHA}` },
];

async function mountDiffView(
  path = "/tasks/1151/diff",
): Promise<{ wrapper: VueWrapper; router: Router }> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "home", component: { template: "<div>home</div>" } },
      { path: "/tasks/:taskId/diff", name: "diff", component: DiffView },
      { path: "/tasks/:taskId/conflict-diff", name: "conflict-diff", component: DiffView },
      { path: "/repo/working-diff", name: "working-diff", component: DiffView },
      { path: "/repo/commits/:sha", name: "commit-diff", component: DiffView },
    ],
  });
  await router.push("/");
  await router.push(path);
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
    if (path.endsWith("/merge-conflict")) {
      return { ok: true, conflict: { patch: PATCH, truncated: false } };
    }
    if (path === "/api/repo/working-diff" || /^\/api\/repo\/commits\/[^/]+$/.test(path)) {
      return { ok: true, patch: PATCH, truncated: false };
    }
    if (path.includes("/file?")) {
      if (path.startsWith("/api/repo/")) {
        return {
          before: "line\n",
          after: "line\nadded\n",
          existsBefore: true,
          existsAfter: true,
        };
      }
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

describe("DiffView Back control on every full-screen route (#1151)", () => {
  it.each(DIFF_ROUTES)("renders a working Back control on $label", async ({ path }) => {
    const { wrapper, router } = await mountDiffView(path);
    const back = wrapper.find(".diff-back-btn");
    expect(back.exists()).toBe(true);
    expect(back.text()).toBe("Back");
    const backSpy = vi.spyOn(router, "back");
    await back.trigger("click");
    expect(backSpy).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
