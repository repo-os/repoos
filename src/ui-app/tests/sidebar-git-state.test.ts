/**
 * Sidebar git-state row (#0584), client side.
 *
 * Two things are pinned here:
 *  - the row's honesty rules — non-base branch and detached HEAD warn,
 *    `unknown` never renders as `clean`, and data older than the freshness
 *    window degrades to `unknown`;
 *  - the store's ingestion — an SSE `repo.status` push applies, the
 *    clean→dirty edge is held back so RepoOS's own write-then-commit churn
 *    cannot strobe it, and focus refetches.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import SidebarGitState from "../src/components/SidebarGitState.vue";
import { useRepoStore } from "../src/stores/repo";
import { EMPTY_COUNTS, FakeEventSource } from "./component-test-helpers";
import type { HistoryCommit } from "../src/lib/repo-history";
import type { RepoStatus } from "../src/types";

function commit(over: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    shortSha: "aaaaaaa",
    subject: "feat: show git state",
    body: "",
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    date: "2026-09-29T12:00:00.000Z",
    refs: ["main"],
    parents: [],
    taskId: null,
    ...over,
  };
}

function status(over: Partial<RepoStatus> = {}): RepoStatus {
  return {
    ok: true,
    branch: "main",
    detached: false,
    baseBranch: "main",
    dirty: [],
    head: "aaaaaaaa",
    recentCommits: [commit()],
    path: "/repo/root",
    computedAt: new Date().toISOString(),
    ...over,
  };
}

let statusFetches = 0;
let store: ReturnType<typeof useRepoStore> | null = null;

function mockFetch(): void {
  const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/repo/status")) {
        statusFetches += 1;
        // Echo whatever the store already holds: the popover refetches on
        // open, and a fixture default must not overwrite a test's setup.
        return json(store?.gitStatus ?? status());
      }
      if (url.includes("/api/health"))
        return json({
          ok: true,
          root: "/tmp/repo",
          projectName: "repo",
          branch: null,
          taskCount: 0,
          workDir: "work",
        });
      if (url.includes("/api/board") || url.includes("/api/index"))
        return json({ tasks: [], counts: EMPTY_COUNTS, taskCount: 0 });
      if (url.includes("/api/agents/running") || url.includes("/api/agents/queued"))
        return json({ tasks: [] });
      if (url.includes("/api/inputs")) return json({ inputs: [] });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

let pinia: Pinia;
let row: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  store = useRepoStore();
  row = null;
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  statusFetches = 0;
  mockFetch();
});

afterEach(() => {
  // Unmount first: the popover is teleported to <body>, and tearing the node
  // down by hand would leave Vue patching a detached parent.
  row?.unmount();
  row = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mountRow(): Promise<ReturnType<typeof mount>> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  row = mount(SidebarGitState, {
    // Attached: the icon must be in the document for a real focus() to fire
    // its focus event (the keyboard-open path).
    attachTo: document.body,
    global: { plugins: [pinia, router] },
  });
  return row;
}

/** Poll until `fn` holds — the SSE handler is synchronous but the fetch path is not. */
async function until(fn: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("sidebar git-state row (#0584)", () => {
  it("shows the branch and a neutral clean state", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ branch: "main", baseBranch: "main" });
    const wrapper = await mountRow();

    expect(wrapper.find(".side-git-name").text()).toBe("main");
    expect(wrapper.find(".side-git-state").text()).toContain("clean");
    expect(wrapper.find(".side-git-state").classes()).toContain("ok");
    expect(wrapper.find(".side-git-branch").classes()).not.toContain("warn");
  });

  it("warns when the checkout is not on the base branch", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ branch: "feat/something-long", baseBranch: "main" });
    const wrapper = await mountRow();

    expect(wrapper.find(".side-git-name").text()).toBe("feat/something-long");
    expect(wrapper.find(".side-git-branch").classes()).toContain("warn");
  });

  it("warns on a detached HEAD instead of naming a branch", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ branch: null, detached: true });
    const wrapper = await mountRow();

    expect(wrapper.find(".side-git-name").text()).toBe("detached");
    expect(wrapper.find(".side-git-branch").classes()).toContain("warn");
  });

  it("counts dirty files in the warning colour", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ dirty: [{ path: "a.ts", status: " M" }] });
    const wrapper = await mountRow();

    const state = wrapper.find(".side-git-state");
    expect(state.text()).toContain("dirty");
    expect(state.text()).toContain("1");
    expect(state.classes()).toContain("warn");
  });

  it("shows unknown — never clean — when git could not be read", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ ok: false, branch: null, head: null, dirty: [] });
    const wrapper = await mountRow();

    const state = wrapper.find(".side-git-state");
    expect(state.text()).toContain("unknown");
    expect(state.text()).not.toContain("clean");
    expect(wrapper.find(".side-git-name").text()).toBe("unknown");
  });

  it("degrades stale data to unknown", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ computedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    const wrapper = await mountRow();

    expect(wrapper.find(".side-git-state").text()).toContain("unknown");
  });

  it("says unknown before the first payload lands", async () => {
    const repo = useRepoStore();
    expect(repo.gitStatus).toBeNull();
    const wrapper = await mountRow();

    expect(wrapper.find(".side-git-state").text()).toContain("unknown");
  });
});

describe("sidebar git-state popover (#0584)", () => {
  it("opens on click, layered on the body, and lists files and commits", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({
      dirty: [
        { path: "src/core/git.ts", status: " M" },
        { path: "notes.md", status: "??" },
      ],
      recentCommits: [commit(), commit({ sha: "b", shortSha: "bbbbbbb" }), commit({ sha: "c" })],
    });
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("click");
    await flushPromises();

    const pop = document.querySelector(".side-git-pop");
    expect(pop).not.toBeNull();
    // Teleported + marked, so the sidebar cannot clip it and a dialog holding
    // <body> cannot make it click-through (#0575).
    expect(document.body.contains(pop)).toBe(true);
    expect(pop!.getAttribute("data-overlay-layer")).toBe("floating");

    const paths = [...document.querySelectorAll(".side-git-file-path")].map((n) => n.textContent);
    expect(paths).toEqual(["src/core/git.ts", "notes.md"]);
    const chips = [...document.querySelectorAll(".side-git-chip")].map((n) => n.textContent);
    expect(chips).toEqual(["M", "??"]);
    expect(document.querySelector(".side-git-chip")!.getAttribute("title")).toBe("modified");

    expect(document.querySelectorAll(".side-git-commits li").length).toBe(3);
    expect(document.querySelector(".side-git-subject")!.textContent).toBe("feat: show git state");
    expect(document.querySelector(".side-git-avatar")!.textContent).toBe("AL");

    const link = document.querySelector(".side-git-history") as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toContain("/repo");
    expect(link!.getAttribute("href")).toContain("tab=history");
  });

  it("caps a long change list with +N more", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({
      dirty: Array.from({ length: 12 }, (_, i) => ({ path: `file-${i}.ts`, status: " M" })),
    });
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("click");
    await flushPromises();

    expect(document.querySelectorAll(".side-git-file-path").length).toBe(8);
    expect(document.querySelector(".side-git-more")!.textContent).toBe("+4 more");
  });

  it("says which checkout it describes", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ path: "/Users/me/my-repo" });
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("click");
    await flushPromises();

    const path = document.querySelector(".side-git-pop-path");
    expect(path?.textContent).toBe("/Users/me/my-repo");
  });

  it("explains an unreadable state instead of implying clean", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status({ ok: false, branch: null });
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("click");
    await flushPromises();

    const note = document.querySelector(".side-git-pop-note");
    expect(note?.textContent).toMatch(/could not be read/i);
    expect(note?.textContent).toMatch(/never as clean/i);
  });

  it("closes on Escape", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status();
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("click");
    await flushPromises();
    expect(document.querySelector(".side-git-pop")).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(document.querySelector(".side-git-pop")).toBeNull();
  });

  it("opens on hover", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status();
    const wrapper = await mountRow();

    await wrapper.find(".side-git-info").trigger("mouseenter");
    await flushPromises();

    expect(document.querySelector(".side-git-pop")).not.toBeNull();
  });

  it("opens on keyboard focus", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status();
    const wrapper = await mountRow();

    // A real focus() with no pointer press in front of it is the keyboard path.
    (wrapper.find(".side-git-info").element as HTMLButtonElement).focus();
    await flushPromises();

    expect(document.querySelector(".side-git-pop")).not.toBeNull();
  });

  it("does not let a pointer press and its focus close what the click opens", async () => {
    const repo = useRepoStore();
    repo.gitStatus = status();
    const wrapper = await mountRow();
    const info = wrapper.find(".side-git-info");

    // pointerdown → (focus) → click, as a real tap produces. The focus the
    // press generates must not open the popover on its own (the click's
    // toggle would then immediately close it again)…
    await info.trigger("pointerdown");
    (info.element as HTMLButtonElement).focus();
    await flushPromises();
    expect(document.querySelector(".side-git-pop")).toBeNull();

    // …so the click is what opens it, and it stays open.
    await info.trigger("click");
    await flushPromises();
    expect(document.querySelector(".side-git-pop")).not.toBeNull();
  });
});

describe("git-state store ingestion (#0584)", () => {
  /** `init()` fires the first status fetch without awaiting it — settle it. */
  async function initStore(): Promise<ReturnType<typeof useRepoStore>> {
    const repo = useRepoStore();
    await repo.init();
    // Wait for the fetch to be APPLIED, not merely issued: an in-flight one
    // would otherwise land after a test's own setup and overwrite it (and it
    // would hold the coalescing guard open).
    await until(() => statusFetches > 0 && repo.gitStatus !== null, "the initial git status");
    return repo;
  }

  it("applies a pushed repo.status event without a refetch", async () => {
    const repo = await initStore();
    const es = FakeEventSource.instances.at(-1)!;
    const before = statusFetches;

    es.emit("repo.status", {
      type: "repo.status",
      status: status({ branch: "feat/pushed" }),
      at: new Date().toISOString(),
    });
    await flushPromises();

    expect(repo.gitStatus?.branch).toBe("feat/pushed");
    // Push, don't poll: the event alone was enough.
    expect(statusFetches).toBe(before);
  });

  it("applies clean immediately but holds the clean→dirty edge", async () => {
    const repo = await initStore();
    const es = FakeEventSource.instances.at(-1)!;
    vi.useFakeTimers();

    // A clean report applies at once — there is nothing to debounce.
    es.emit("repo.status", {
      type: "repo.status",
      status: status({ dirty: [] }),
      at: new Date().toISOString(),
    });
    expect(repo.gitStatus?.dirty).toEqual([]);

    // Dirty follows a write that RepoOS will commit a moment later.
    es.emit("repo.status", {
      type: "repo.status",
      status: status({ dirty: [{ path: "a.ts", status: " M" }] }),
      at: new Date().toISOString(),
    });
    expect(repo.gitStatus?.dirty).toEqual([]);

    // Still quiet inside the window…
    await vi.advanceTimersByTimeAsync(1500);
    expect(repo.gitStatus?.dirty).toEqual([]);

    // …and shown once the churn window passes.
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.gitStatus?.dirty).toHaveLength(1);
  });

  it("lets a clean report cancel a pending dirty edge", async () => {
    const repo = await initStore();
    const es = FakeEventSource.instances.at(-1)!;
    vi.useFakeTimers();

    es.emit("repo.status", {
      type: "repo.status",
      status: status({ dirty: [{ path: "a.ts", status: " M" }] }),
      at: new Date().toISOString(),
    });
    // RepoOS committed it before the window elapsed.
    es.emit("repo.status", {
      type: "repo.status",
      status: status({ dirty: [] }),
      at: new Date().toISOString(),
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(repo.gitStatus?.dirty).toEqual([]);
  });

  it("refetches when the window regains focus", async () => {
    const repo = await initStore();
    const before = statusFetches;

    window.dispatchEvent(new Event("focus"));
    await until(() => statusFetches > before, "a focus refetch of git status");

    expect(repo.gitStatus?.ok).toBe(true);
  });

  it("coalesces concurrent refetches into one request", async () => {
    const repo = await initStore();
    const before = statusFetches;

    await Promise.all([repo.refreshGitStatus(), repo.refreshGitStatus(), repo.refreshGitStatus()]);

    expect(statusFetches).toBe(before + 1);
  });

  it("refetches when the tab becomes visible again", async () => {
    const repo = await initStore();
    const before = statusFetches;

    document.dispatchEvent(new Event("visibilitychange"));
    await until(() => statusFetches > before, "a visibility refetch of git status");

    expect(repo.gitStatus?.ok).toBe(true);
  });

  it("refetches when the event stream reconnects", async () => {
    const repo = await initStore();
    const es = FakeEventSource.instances.at(-1)!;
    const before = statusFetches;

    // What EventSource runs on every reconnect — events are not replayed.
    es.onopen?.();
    await until(() => statusFetches > before, "a reconnect refetch of git status");

    expect(repo.gitStatus?.ok).toBe(true);
  });

  it("keeps a slow fallback interval while the tab is visible", async () => {
    vi.useFakeTimers();
    const repo = useRepoStore();
    await repo.init();
    await vi.advanceTimersByTimeAsync(0);
    expect(repo.gitStatus).not.toBeNull();
    const before = statusFetches;

    await vi.advanceTimersByTimeAsync(45_000);

    expect(statusFetches).toBeGreaterThan(before);
  });
});
