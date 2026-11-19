/**
 * CloseOutDialogs is the single presenter for the two close-out confirmation
 * rejections — a dirty checkout (0204/#0512) and a worktree changed after
 * handoff (#0598/#0834). `completeTask` writes the store record before it
 * throws, and `repo.onError` swallows those error types, so the record is the
 * open-dialog signal. This covers the record-driven path the
 * `card:handoffConflict` shot-preview fixture relies on (#0810): it needs no
 * drawer and fires no request for the fake task id.
 *
 * Previously TaskCard, TaskDrawer and BoardColumn each carried their own
 * dialog copy; a store-seeded record could stack two body-teleported overlays
 * (a drag-to-done rejection opened the column's copy on top of the card's
 * watcher) and a cleared record left the card's copy open with stale content.
 * One owner fixes both; the no-double regression lives in
 * `work-board-moves-qa-browser.test.ts` with the real card mounted.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import CloseOutDialogs from "../src/components/CloseOutDialogs.vue";
import { useRepoStore } from "../src/stores/repo";
import { DirtyCheckoutError } from "../src/stores/repo";
import type { Task } from "../src/types";

const makeTask = (over: Partial<Task> = {}): Task => ({
  id: "0042",
  title: "Test task",
  type: "feature",
  status: "review",
  priority: "p2",
  area: "web",
  assignee: "ai",
  assignedTo: "ai",
  createdBy: "",
  branch: "",
  tags: [],
  needsInput: false,
  needsMerge: false,
  created_at: null,
  updated_at: null,
  path: "work/0042-test.md",
  absPath: "/tmp/repo/work/0042-test.md",
  body: "",
  extra: {},
  agentOverride: null,
  cliOverride: null,
  modelOverride: null,
  git: {
    branchExists: false,
    worktreeExists: false,
    lastCommit: null,
    lastCommitAt: null,
    worktreePath: null,
    dirty: false,
  },
  preview: null,
  ...over,
});

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

async function flush(): Promise<void> {
  await flushPromises();
  for (let i = 0; i < 4; i++) await nextTick();
}

function mountDialogs() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    pinia,
    wrapper: mount(CloseOutDialogs, { attachTo: document.body, global: { plugins: [pinia] } }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("CloseOutDialogs: store-seeded worktree-handoff conflict (#0810)", () => {
  it("opens the file-list modal from a store-seeded conflict", async () => {
    const { pinia, wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff: HEAD is 1a2b3c4d but handoff recorded 5e6f7a8b.",
      files: [
        { path: "src/a.ts", added: 3, removed: 1, taskFile: false },
        { path: "work/0042-x.md", added: 1, removed: 0, taskFile: true },
      ],
    });
    await flush();

    expect(document.body.querySelector("#handoff-conflict-title")).toBeTruthy();
    const rows = [...document.body.querySelectorAll(".dirty-list .dirty-file")];
    expect(rows).toHaveLength(2);
    // Counts render, and the task file is grouped after the source change.
    expect(rows[0]!.textContent).toContain("+3");
    expect(rows[0]!.textContent).toContain("-1");
    expect(document.body.querySelector(".dirty-file-group")?.textContent).toContain("task files");
    expect(document.body.querySelectorAll(".dirty-actions button")).toHaveLength(3);
    // Exactly one overlay for one record — the no-double guarantee.
    expect(document.body.querySelectorAll(".dirty-overlay")).toHaveLength(1);
    wrapper.unmount();
    void pinia;
  });

  it("closes when the record clears instead of staying open with stale content", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff",
      files: [{ path: "src/a.ts", added: 1, removed: 0, taskFile: false }],
    });
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();

    repo.clearWorktreeHandoffConflict("0042");
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeNull();
    wrapper.unmount();
  });

  it("the send-back action moves the task back to the engineer and closes", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    const task = makeTask();
    repo.tasks = [task];
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff",
      files: [{ path: "src/a.ts", added: 1, removed: 0, taskFile: false }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/api/tasks/0042")
          ? jsonResponse(200, { ...task, status: "active" })
          : jsonResponse(200, {}),
      ),
    );
    await flush();

    const sendBack = (
      [...document.body.querySelectorAll(".dirty-actions button")] as HTMLButtonElement[]
    ).find((b) => /send back/i.test(b.textContent ?? ""));
    expect(sendBack).toBeTruthy();
    sendBack!.click();
    await flush();
    expect(repo.worktreeHandoffConflictFor("0042")).toBeNull();
    expect(document.body.querySelector(".dirty-overlay")).toBeNull();
    expect(repo.toasts).toHaveLength(0);
    wrapper.unmount();
  });
});

describe("CloseOutDialogs: dirty-checkout record (0204/#0512)", () => {
  it("opens the commit-or-cancel dialog from a DirtyCheckoutError record and cancels clean", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.tasks = [makeTask()];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          return jsonResponse(409, {
            ok: false,
            needsCommit: true,
            dirtyFiles: ["repoos.toml"],
            dirtyScope: "main",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    // The card-button / drag / keep-review paths all funnel through this: the
    // call throws, the record stays, the owner speaks.
    await expect(repo.completeTask(makeTask())).rejects.toBeInstanceOf(DirtyCheckoutError);
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();
    expect(document.body.textContent ?? "").toContain("main has uncommitted changes");
    expect(document.body.textContent ?? "").toContain("repoos.toml");

    const cancel = (
      [...document.body.querySelectorAll(".dirty-actions button")] as HTMLButtonElement[]
    ).find((b) => b.textContent?.trim() === "Cancel");
    cancel!.click();
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeNull();
    expect(repo.dirtyFilesFor("0042")).toEqual([]);
    wrapper.unmount();
  });

  it("a still-dirty retry rewrites the record and keeps the dialog for the next choice", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.tasks = [makeTask()];
    let doneCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("/done")) {
          doneCalls++;
          if (doneCalls > 1) {
            expect(JSON.parse(String(init?.body ?? "{}"))).toMatchObject({ commitDirty: true });
          }
          return jsonResponse(409, {
            ok: false,
            needsCommit: true,
            dirtyFiles: ["repoos.toml", "src/ui-app/src/style.css"],
            dirtyScope: "main",
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const task = makeTask();
    await expect(repo.completeTask(task)).rejects.toBeInstanceOf(DirtyCheckoutError);
    await flush();
    expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();

    const commit = (
      [...document.body.querySelectorAll(".dirty-actions button")] as HTMLButtonElement[]
    ).find((b) => b.textContent?.includes("Commit"));
    commit!.click();
    await flush();
    expect(doneCalls).toBe(2);
    // Still dirty: the dialog stays, now naming the refreshed file list.
    expect(document.body.querySelector(".dirty-overlay")).toBeTruthy();
    expect(repo.dirtyFilesFor("0042")).toEqual(["repoos.toml", "src/ui-app/src/style.css"]);
    wrapper.unmount();
  });

  it("a WorktreeHandoffConflictError on the retry switches to the conflict dialog", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.tasks = [makeTask()];
    let doneCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          doneCalls++;
          if (doneCalls === 1) {
            return jsonResponse(409, {
              ok: false,
              needsCommit: true,
              dirtyFiles: ["repoos.toml"],
              dirtyScope: "main",
            });
          }
          return jsonResponse(409, {
            ok: false,
            worktreeChangedAfterHandoff: true,
            error: "worktree changed after handoff",
            files: [{ path: "src/a.ts", added: 2, removed: 0, taskFile: false }],
          });
        }
        return jsonResponse(200, {});
      }),
    );

    const task = makeTask();
    await expect(repo.completeTask(task)).rejects.toBeInstanceOf(DirtyCheckoutError);
    await flush();
    expect(document.body.textContent ?? "").toContain("main has uncommitted changes");

    const commit = (
      [...document.body.querySelectorAll(".dirty-actions button")] as HTMLButtonElement[]
    ).find((b) => b.textContent?.includes("Commit"));
    commit!.click();
    await flush();
    // The dirty record resolved into a conflict record; the owner swapped the
    // dialog instead of stacking a second overlay.
    expect(document.body.querySelectorAll(".dirty-overlay")).toHaveLength(1);
    expect(document.body.textContent ?? "").toContain("Worktree changed after handoff");
    expect(repo.dirtyFilesFor("0042")).toEqual([]);
    expect(repo.worktreeHandoffConflictFor("0042")).toBeTruthy();
    wrapper.unmount();
  });
});

describe("CloseOutDialogs: the record is the single open-dialog signal", () => {
  it("renders one overlay per visible record, resolving them one at a time", async () => {
    const { wrapper } = mountDialogs();
    const repo = useRepoStore();
    repo.seedWorktreeHandoffConflict("0042", {
      message: "worktree changed after handoff",
      files: [{ path: "src/a.ts", added: 1, removed: 0, taskFile: false }],
    });
    repo.tasks = [makeTask({ id: "0043" })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/done")) {
          return jsonResponse(409, {
            ok: false,
            needsCommit: true,
            dirtyFiles: ["repoos.toml"],
            dirtyScope: "main",
          });
        }
        return jsonResponse(200, {});
      }),
    );
    await expect(repo.completeTask(makeTask({ id: "0043" }))).rejects.toBeInstanceOf(
      DirtyCheckoutError,
    );
    await flush();

    // Two records exist; the owner shows one at a time (first conflict, then
    // the dirty record after it resolves).
    expect(document.body.querySelectorAll(".dirty-overlay")).toHaveLength(1);
    expect(document.body.textContent ?? "").toContain("Worktree changed after handoff");

    repo.clearWorktreeHandoffConflict("0042");
    await flush();
    expect(document.body.querySelectorAll(".dirty-overlay")).toHaveLength(1);
    expect(document.body.textContent ?? "").toContain("main has uncommitted changes");
    expect(document.body.textContent ?? "").not.toContain("Worktree changed after handoff");
    wrapper.unmount();
  });
});
