import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
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
  BOARD_MEDIUM_BREAKPOINT_PX,
  SKELETON_MIN_VISIBLE_MS,
  SKELETON_SHOW_DELAY_MS,
} from "../src/lib/loading-skeleton";
import { INPUT_BOARD_COLUMN_COUNT, WORK_BOARD_COLUMN_COUNT } from "../src/lib/work-board-columns";
import { GENERAL_FIELD_SECTIONS } from "../src/settings-location";

const appVue = readFileSync(resolve(__dirname, "../src/App.vue"), "utf8");
const LoadingHarness = defineComponent({
  components: { PageSkeleton },
  props: { loading: { type: Boolean, required: true } },
  template: '<PageSkeleton kind="rows" :loading="loading" defer />',
});
const ImmediateSkeletonHarness = defineComponent({
  components: { PageSkeleton },
  props: { loading: { type: Boolean, required: true } },
  template: '<PageSkeleton kind="rows" :loading="loading" />',
});
describe("repo loading skeleton", () => {
  it("renders a route skeleton instead of the centered spinner", () => {
    expect(appVue).not.toMatch(/v-if="repo\.loading"[^>]*class="spin"/);
    expect(appVue).toMatch(
      /v-if="showLoadingShell"\s+key="loading"\s+class="main-route page-loading"/,
    );
    expect(appVue).toContain(
      "const showLoadingShell = computed(() => repo.loading || showRepoSkeleton.value);",
    );
    expect(appVue).toMatch(/:loading="repo\.loading"/);
    expect(appVue).toContain('@visibility-change="showRepoSkeleton = $event"');
    expect(appVue).toMatch(/:loading="repo\.loading"\s+defer/);
    expect(appVue).not.toContain("skeletonDelay");
    expect(appVue).not.toContain("page-loading-shell");
    expect(appVue).toMatch(
      /<div v-if="showLoadingShell" key="loading" class="main-route page-loading">[\s\S]*<RouterView v-else class="main-route" \/>/,
    );
    const styles = readFileSync(resolve(__dirname, "../src/style.css"), "utf8");
    expect(styles).toMatch(/\.main\s*\{[^}]*padding:\s*22px 26px 0;/s);
    expect(styles).not.toMatch(/\.main\s*>\s*\.page-fade-leave-active\s*\{/);
    expect(styles).not.toContain("page-fade");
    expect(styles).toMatch(
      /@media \(max-width: 760px\)\s*\{[\s\S]*?\.main\s*\{[^}]*padding:\s*18px 16px 0;[^}]*padding-inline-end:\s*max\(16px,\s*var\(--page-inline-end-inset\)\);/,
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

  it("matches the board breakpoint and names each page layout count", () => {
    const css = readFileSync(resolve(__dirname, "../src/components/PageSkeleton.vue"), "utf8");
    expect(css).toContain(`@media (max-width: ${BOARD_MEDIUM_BREAKPOINT_PX}px)`);
    expect(LOADING_SKELETON_ITEM_COUNTS).toMatchObject({
      dashboard: 1,
      cards: 1,
      table: 5,
      rows: 1,
      targets: 2,
      deployments: 3,
    });
  });

  it("keeps Mission Control and Stories to one content block", () => {
    const dashboard = readFileSync(resolve(__dirname, "../src/views/DashboardView.vue"), "utf8");
    const stories = readFileSync(resolve(__dirname, "../src/views/StoriesView.vue"), "utf8");
    expect(dashboard.match(/class="page-scroll-body"/g)).toHaveLength(1);
    expect(stories).toMatch(/v-for="story in visibleStories"/);
    expect(loadingSkeletonKind("/")).toBe("dashboard");
    expect(loadingSkeletonKind("/stories")).toBe("rows");
  });

  it("uses one representative block while the gated collection is not loaded", () => {
    const settings = readFileSync(resolve(__dirname, "../src/views/SettingsView.vue"), "utf8");
    const agents = readFileSync(resolve(__dirname, "../src/views/AgentsView.vue"), "utf8");
    const checks = readFileSync(resolve(__dirname, "../src/views/ChecksView.vue"), "utf8");
    const releases = readFileSync(resolve(__dirname, "../src/views/ReleasesView.vue"), "utf8");
    const deployments = readFileSync(
      resolve(__dirname, "../src/views/DeploymentsView.vue"),
      "utf8",
    );
    const dev = readFileSync(resolve(__dirname, "../src/views/DevView.vue"), "utf8");
    const checkRuns = readFileSync(
      resolve(__dirname, "../src/components/CheckRunsPanel.vue"),
      "utf8",
    );
    const secrets = readFileSync(resolve(__dirname, "../src/views/SecretsView.vue"), "utf8");
    const reminders = readFileSync(
      resolve(__dirname, "../src/components/RemindersPanel.vue"),
      "utf8",
    );
    const schedules = readFileSync(
      resolve(__dirname, "../src/components/ScheduledTasksPanel.vue"),
      "utf8",
    );
    const providers = readFileSync(
      resolve(__dirname, "../src/components/ModelProvidersPanel.vue"),
      "utf8",
    );
    expect(GENERAL_FIELD_SECTIONS).toHaveLength(6);
    expect(settings).toMatch(/kind="rows" :count="GENERAL_FIELD_SECTIONS\.length"/);
    for (const source of [
      agents,
      checks,
      secrets,
      releases,
      deployments,
      dev,
      checkRuns,
      reminders,
      schedules,
      providers,
    ]) {
      const tags = [...source.matchAll(/<PageSkeleton\b[\s\S]*?\/>/g)].map((match) => match[0]);
      for (const tag of tags) {
        expect(tag).not.toMatch(
          /:count="(?:localAgents|detectRows|steps|snapshot|distribution|services|targets|runs|store\.reminders|schedules|rows)\.*/,
        );
        expect(tag).not.toContain(":matrix-count=");
      }
    }
  });

  it("keeps per-view skeletons immediate and reserves the timing gate for the shell", () => {
    const callsitePaths = [
      "../src/views/ChecksView.vue",
      "../src/views/SecretsView.vue",
      "../src/views/SettingsView.vue",
      "../src/views/AgentsView.vue",
      "../src/views/ReleasesView.vue",
      "../src/views/DeploymentsView.vue",
      "../src/views/DevView.vue",
      "../src/components/CheckRunsPanel.vue",
      "../src/components/RemindersPanel.vue",
      "../src/components/ScheduledTasksPanel.vue",
      "../src/components/ModelProvidersPanel.vue",
    ];
    for (const path of callsitePaths) {
      const source = readFileSync(resolve(__dirname, path), "utf8");
      const tags = [...source.matchAll(/<PageSkeleton\b[\s\S]*?\/>/g)].map((match) => match[0]);
      expect(tags.length, path).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, path).toContain(":loading=");
        expect(tag, path).not.toMatch(/\bdefer\b/);
      }
    }
  });

  it("renders each skeleton kind from the real column or representative-block layout", async () => {
    vi.useFakeTimers();
    const kinds = [
      "board",
      "inputBoard",
      "dashboard",
      "cards",
      "table",
      "rows",
      "targets",
      "deployments",
    ] as const;
    const wrappers = kinds.map((kind) => mount(PageSkeleton, { props: { kind, loading: true } }));
    await vi.advanceTimersByTimeAsync(0);
    for (const wrapper of wrappers) {
      expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    }
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    for (const [index, wrapper] of wrappers.entries()) {
      const expected =
        kinds[index] === "board"
          ? WORK_BOARD_COLUMN_COUNT
          : kinds[index] === "inputBoard"
            ? INPUT_BOARD_COLUMN_COUNT
            : LOADING_SKELETON_ITEM_COUNTS[kinds[index]!];
      expect(
        wrapper.find(".page-skeleton").findAll(":scope > .page-skeleton__item"),
        kinds[index],
      ).toHaveLength(expected);
      wrapper.unmount();
    }
    expect(GENERAL_FIELD_SECTIONS.length).toBe(6);
    const settings = mount(PageSkeleton, {
      props: {
        kind: "rows",
        loading: true,
        count: GENERAL_FIELD_SECTIONS.length,
      },
    });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    expect(settings.find(".page-skeleton").findAll(":scope > .page-skeleton__item")).toHaveLength(
      GENERAL_FIELD_SECTIONS.length,
    );
    settings.unmount();
    const planSized = mount(PageSkeleton, {
      props: { kind: "table", loading: true, count: 12 },
    });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    expect(planSized.find(".page-skeleton").findAll(":scope > .page-skeleton__item")).toHaveLength(
      12,
    );
    planSized.unmount();
    vi.useRealTimers();
  });

  it("honors reduced motion when the platform preference is active", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    const wrapper = mount(LoadingHarness, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    expect(wrapper.find(".page-skeleton").classes()).toContain("page-skeleton--reduced-motion");
    expect(wrapper.find(".page-skeleton").classes()).not.toContain("page-skeleton--motion-active");
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("activates the shared pulse when reduced motion is off", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private readonly callback: IntersectionObserverCallback) {}
        observe(target: Element): void {
          this.callback(
            [{ target, isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        unobserve(): void {}
        disconnect(): void {}
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      },
    );
    const wrapper = mount(LoadingHarness, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    expect(wrapper.find(".page-skeleton").classes()).toContain("page-skeleton--motion-active");
    const source = readFileSync(resolve(__dirname, "../src/components/PageSkeleton.vue"), "utf8");
    expect(source).toMatch(
      /\.page-skeleton--motion-active \.page-skeleton__item i\s*\{\s*animation: page-skeleton-pulse/,
    );
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("suppresses fast and cached shell loads", async () => {
    vi.useFakeTimers();
    const wrapper = mount(LoadingHarness, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS - 1);
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(SKELETON_MIN_VISIBLE_MS);
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    const cached = mount(LoadingHarness, { props: { loading: false } });
    expect(cached.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
    cached.unmount();
    vi.useRealTimers();
  });

  it("keeps the shell skeleton visible for the minimum interval", async () => {
    vi.useFakeTimers();
    const wrapper = mount(LoadingHarness, { props: { loading: true } });
    await vi.advanceTimersByTimeAsync(SKELETON_SHOW_DELAY_MS);
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    await wrapper.setProps({ loading: false });
    await vi.advanceTimersByTimeAsync(SKELETON_MIN_VISIBLE_MS - 1);
    expect(wrapper.find(".page-skeleton").exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.find(".page-skeleton").exists()).toBe(false);
    wrapper.unmount();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not force loading-state shots through the production app shell", () => {
    const fixtures = readFileSync(resolve(__dirname, "../../core/shot-fixtures.ts"), "utf8");
    expect(fixtures).not.toContain('"loading:dashboard"');
    expect(fixtures).not.toContain('"loading:stories"');
    expect(appVue).not.toContain("forcedLoadingShot");
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
    vi.unstubAllGlobals();
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
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});
