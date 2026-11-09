import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import App from "../src/App.vue";
import PageSkeleton from "../src/components/PageSkeleton.vue";
import { useRepoStore } from "../src/stores/repo";
import {
  loadingPageHeader,
  loadingSkeletonKind,
  LOADING_SKELETON_ROUTES,
  LOADING_SKELETON_ITEM_COUNTS,
} from "../src/lib/loading-skeleton";
import { INPUT_BOARD_COLUMN_COUNT, WORK_BOARD_COLUMN_COUNT } from "../src/lib/work-board-columns";

const appVue = readFileSync(resolve(__dirname, "../src/App.vue"), "utf8");

describe("repo loading skeleton", () => {
  it("renders a route skeleton instead of the centered spinner", () => {
    expect(appVue).not.toMatch(/v-if="repo\.loading"[^>]*class="spin"/);
    expect(appVue).toMatch(
      /v-if="repo\.loading \|\| showRepoSkeleton \|\| forcedLoadingShot"\s+class="main-route page-loading"/,
    );
    expect(appVue).toMatch(
      /:aria-busy="showRepoSkeleton \|\| forcedLoadingShot \? 'true' : undefined"/,
    );
    expect(appVue).toMatch(
      /<PageSkeleton v-if="showRepoSkeleton \|\| forcedLoadingShot" :kind="loadingKind"\s*\/>/,
    );
    expect(appVue).toMatch(
      /<RouterView\s+v-if="!repo\.loading && !showRepoSkeleton && !forcedLoadingShot"\s+class="main-route"\s*\/>/,
    );
  });

  it("picks a board for /work and rows for list pages", () => {
    expect(loadingSkeletonKind("/work")).toBe("board");
    expect(loadingSkeletonKind("/work?task=0972")).toBe("board");
    expect(loadingSkeletonKind("/stories")).toBe("rows");
    expect(loadingSkeletonKind("/settings")).toBe("rows");
    for (const path of ["/inputs", "/client-board"]) {
      expect(loadingSkeletonKind(path)).toBe("inputBoard");
    }
    expect(loadingSkeletonKind("/")).toBe("dashboard");
    expect(loadingSkeletonKind("/checks")).toBe("table");
    expect(loadingSkeletonKind("/agents")).toBe("cards");
    expect(loadingSkeletonKind("/dev")).toBe("targets");
    expect(loadingSkeletonKind("/deployments")).toBe("deployments");
  });

  it("maps every standard route to an explicit skeleton kind", () => {
    const routerSrc = readFileSync(resolve(__dirname, "../src/router.ts"), "utf8");
    const paths = [...routerSrc.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]!);
    const pages = paths.filter(
      (path) =>
        path !== "/login" &&
        path !== "/repo/working-diff" &&
        !path.includes(":") &&
        !path.includes("*"),
    );
    expect(pages.sort()).toEqual([...LOADING_SKELETON_ROUTES].sort());
    expect(loadingSkeletonKind("/repo/working-diff")).toBe("rows");
    expect(loadingSkeletonKind("/tasks/0001/diff")).toBe("rows");
    expect(loadingSkeletonKind("/repo/commits/abc")).toBe("rows");
    for (const path of pages) {
      expect(loadingSkeletonKind(path), path).toBeTruthy();
    }
  });

  it("uses six work columns and three input columns", () => {
    expect(WORK_BOARD_COLUMN_COUNT).toBe(6);
    expect(INPUT_BOARD_COLUMN_COUNT).toBe(3);
  });

  it("uses a single dashboard block and one representative row for Stories", () => {
    const skeleton = readFileSync(resolve(__dirname, "../src/components/PageSkeleton.vue"), "utf8");
    expect(skeleton).toMatch(/kind === "dashboard" \|\| props\.kind === "rows"\) return 1/);
    expect(skeleton).toMatch(/page-skeleton--dashboard,\s*\.page-skeleton--rows/);
    expect(loadingSkeletonKind("/")).toBe("dashboard");
    expect(loadingSkeletonKind("/stories")).toBe("rows");
  });

  it("renders the declared count for every skeleton kind from the layout definitions", () => {
    const kinds = Object.keys(LOADING_SKELETON_ITEM_COUNTS) as Array<
      keyof typeof LOADING_SKELETON_ITEM_COUNTS
    >;
    for (const kind of kinds) {
      const wrapper = mount(PageSkeleton, { props: { kind } });
      const expected =
        kind === "board"
          ? WORK_BOARD_COLUMN_COUNT
          : kind === "inputBoard"
            ? INPUT_BOARD_COLUMN_COUNT
            : LOADING_SKELETON_ITEM_COUNTS[kind];
      expect(wrapper.findAll(":scope > .page-skeleton__item"), kind).toHaveLength(expected);
      wrapper.unmount();
    }
  });

  it("uses a static placeholder animation under reduced motion", () => {
    const skeleton = readFileSync(resolve(__dirname, "../src/components/PageSkeleton.vue"), "utf8");
    expect(skeleton).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?animation: none/);
  });

  it("registers deterministic loading fixtures for the two corrected pages", () => {
    const fixtures = readFileSync(resolve(__dirname, "../../core/shot-fixtures.ts"), "utf8");
    const app = readFileSync(resolve(__dirname, "../src/App.vue"), "utf8");
    expect(fixtures).toContain('"loading:dashboard"');
    expect(fixtures).toContain('"loading:stories"');
    expect(app).toContain('route.query.shotState === "loading:dashboard"');
    expect(app).toContain('route.query.shotState === "loading:stories"');
  });

  it("gives every standard page a title to keep above its skeleton", () => {
    for (const path of ["/", "/work", "/inputs", "/stories", "/checks", "/releases"]) {
      expect(loadingPageHeader(path)?.title, path).toBeTruthy();
    }
    for (const path of ["/deployments", "/dev", "/secrets", "/agents", "/settings", "/repo"]) {
      expect(loadingPageHeader(path)?.title, path).toBeTruthy();
    }
    expect(loadingPageHeader("/work?task=0972")?.title).toBe("Work Queue");
    expect(loadingPageHeader("/client-board")?.title).toBe("Project board");
    expect(loadingPageHeader("/tasks/0001/diff")).toBeNull();
  });

  it("shows a board skeleton in the main pane and no spinner while the repo loads", async () => {
    vi.useFakeTimers();
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
    expect(main.find(".page-skeleton").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();
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
    vi.useRealTimers();
  });

  it("keeps the shell skeleton out of fast loads and retains a shown one for 350ms", async () => {
    vi.useFakeTimers();
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div>dashboard</div>" } }],
    });
    await router.push("/");
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
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    useRepoStore().loading = false;
    await wrapper.vm.$nextTick();
    await vi.advanceTimersByTimeAsync(349);
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
    vi.useRealTimers();
  });
});
