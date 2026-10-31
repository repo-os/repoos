import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../src/App.vue";
import { loadingPageHeader, loadingSkeletonKind } from "../src/lib/loading-skeleton";

const appVue = readFileSync(resolve(__dirname, "../src/App.vue"), "utf8");

describe("repo loading skeleton", () => {
  it("renders a route skeleton instead of the centered spinner", () => {
    expect(appVue).not.toMatch(/v-if="repo\.loading"[^>]*class="spin"/);
    expect(appVue).toMatch(/v-if="repo\.loading" class="main-route page-loading"/);
    expect(appVue).toMatch(/<PageSkeleton :kind="loadingKind"\s*\/>/);
    expect(appVue).toMatch(/<RouterView v-else class="main-route"\s*\/>/);
  });

  it("picks a board for /work and rows for list pages", () => {
    expect(loadingSkeletonKind("/work")).toBe("board");
    expect(loadingSkeletonKind("/work?task=0972")).toBe("board");
    expect(loadingSkeletonKind("/stories")).toBe("rows");
    expect(loadingSkeletonKind("/settings")).toBe("rows");
    expect(loadingSkeletonKind("/inputs")).toBe("rows");
    expect(loadingSkeletonKind("/")).toBe("rows");
    expect(loadingSkeletonKind("/checks")).toBe("table");
    expect(loadingSkeletonKind("/agents")).toBe("cards");
    expect(loadingSkeletonKind("/dev")).toBe("targets");
    expect(loadingSkeletonKind("/deployments")).toBe("deployments");
  });

  it("gives every standard page a title to keep above its skeleton", () => {
    for (const path of ["/", "/work", "/inputs", "/stories", "/checks", "/releases"]) {
      expect(loadingPageHeader(path)?.title, path).toBeTruthy();
    }
    for (const path of ["/deployments", "/dev", "/secrets", "/agents", "/settings", "/repo"]) {
      expect(loadingPageHeader(path)?.title, path).toBeTruthy();
    }
    expect(loadingPageHeader("/work?task=0972")?.title).toBe("Work Queue");
    expect(loadingPageHeader("/tasks/0001/diff")).toBeNull();
  });

  it("shows a board skeleton in the main pane and no spinner while the repo loads", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/work", component: { template: "<div>board</div>" } }],
    });
    await router.push("/work");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    const wrapper = mount(App, {
      global: {
        plugins: [pinia, router],
        stubs: {
          TopBar: true,
          Sidebar: true,
          MobileTabs: true,
          TaskDrawer: true,
          TunnelDrawer: true,
          RemoteValidationDrawer: true,
          ToastPanel: true,
          FloatingHeads: true,
          NewInputPanel: true,
          UiRecoveryBanner: true,
          CopyInspectorOverlay: true,
          ReleaseUpdateNotification: true,
          DependencyOverrideDialog: true,
        },
      },
    });
    const main = wrapper.find(".main");
    const title = main.find(".page-header .page-title");
    expect(title.text()).toBe("Work Queue");
    expect(
      main.element
        .querySelector(".page-title")!
        .compareDocumentPosition(main.element.querySelector(".page-skeleton")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main.find(".page-skeleton").exists()).toBe(true);
    expect(main.find(".page-skeleton--board").exists()).toBe(true);
    expect(main.find(".spin").exists()).toBe(false);
    wrapper.unmount();
  });
});
