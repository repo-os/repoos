/**
 * Uncommitted-changes panel (#1030).
 *
 * The sidebar's full-width amber button opens a right panel with the shared
 * drawer width/styling, lists every dirty file, shows the working-tree diff in
 * the same viewer as the task drawer's Changes tab, and commits through the
 * one existing commit pipeline (`POST /api/repo/commit`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import RepoDirtyPanel from "../src/components/RepoDirtyPanel.vue";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";
import type { RepoStatus } from "../src/types";

function status(over: Partial<RepoStatus> = {}): RepoStatus {
  return {
    ok: true,
    branch: "main",
    detached: false,
    baseBranch: "main",
    dirty: [],
    head: "aaaaaaaa",
    recentCommits: [],
    path: "/repo/root",
    computedAt: new Date().toISOString(),
    ...over,
  };
}

const PATCH = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 1111111..2222222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,3 @@",
  " const a = 1;",
  "+const b = 2;",
  " export { a };",
  "",
].join("\n");

type Reply = { status?: number; body: unknown };
let currentStatus: RepoStatus;
let commitReply: Reply;
let diffReply: Reply;
let commits: Array<{ message: string }>;
let fetches: string[];
/** When set, `/api/repo/commit` waits for it before answering (in-flight tests). */
let commitGate: Promise<void> | null;

const response = (reply: Reply) => {
  const code = reply.status ?? 200;
  return { ok: code < 400, status: code, statusText: "", json: async () => reply.body };
};

function installFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetches.push(url);
      if (url.includes("/api/repo/status")) return response({ body: currentStatus });
      if (url.includes("/api/repo/working-diff")) return response(diffReply);
      if (url.includes("/api/repo/commit")) {
        commits.push(JSON.parse(String(init?.body ?? "{}")) as { message: string });
        if ((commitReply.status ?? 200) < 400) currentStatus = status({ dirty: [] });
        return response(commitReply);
      }
      if (url.includes("/api/health"))
        return response({ body: { ok: true, root: "/tmp/repo", taskCount: 0, workDir: "work" } });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

let pinia: Pinia;
let wrapper: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  pinia = createPinia();
  setActivePinia(pinia);
  currentStatus = status({
    dirty: [
      { path: "src/a.ts", status: " M" },
      { path: "notes.md", status: "??" },
    ],
  });
  commitReply = { body: { ok: true, branch: "main", sha: "abc1234", files: 2 } };
  diffReply = { body: { ok: true, patch: PATCH, truncated: false } };
  commits = [];
  fetches = [];
  installFetch();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  vi.unstubAllGlobals();
});

/** Mount closed, then open it: the panel loads its diff on the open edge. */
async function openPanel(): Promise<ReturnType<typeof mount>> {
  const repo = useRepoStore();
  repo.gitStatus = currentStatus;
  wrapper = mount(RepoDirtyPanel, { props: { open: false }, attachTo: document.body });
  await wrapper.setProps({ open: true });
  await flushPromises();
  return wrapper;
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-testid="repo-dirty-panel"]');
}

describe("uncommitted-changes panel (#1030)", () => {
  it("renders in the shared drawer shell at the global drawer width", async () => {
    const ui = useUiStore();
    ui.drawerWidth = 680;
    await openPanel();

    const el = panel();
    expect(el).not.toBeNull();
    expect(el!.className).toContain("drawer-wrap");
    expect(el!.className).toContain("drawer");
    expect(el!.getAttribute("style")).toContain("width: 680px");
    expect(el!.querySelector(".drawer-resize")).not.toBeNull();
    expect(el!.querySelector(".drawer-head")).not.toBeNull();
    expect(el!.querySelector(".drawer-body")).not.toBeNull();
    expect(el!.querySelector('[role="dialog"]')).toBeNull();
  });

  it("lists every dirty file, including untracked ones, and shows the diff", async () => {
    await openPanel();

    const paths = [...document.querySelectorAll(".repo-dirty-file-path")].map((n) => n.textContent);
    expect(paths).toEqual(["src/a.ts", "notes.md"]);
    // The untracked file has no `git diff HEAD` section yet, and says so.
    expect(document.querySelectorAll(".repo-dirty-file-word")[1]?.textContent).toBe("no diff yet");
    expect(panel()!.textContent).toContain("2 files on main");
    // The Changes-tab viewer renders the patch inline; its own compact file
    // list is off because this panel lists files from `repo.status`.
    expect(document.querySelector(".diff-section-name")?.textContent).toBe("src/a.ts");
    expect(document.querySelector(".diff-file-list")).toBeNull();
    expect(panel()!.textContent).toContain("+const b = 2;");
  });

  it("commits with the typed message and empties the panel", async () => {
    await openPanel();

    const textarea = document.querySelector<HTMLTextAreaElement>("#repo-dirty-message")!;
    textarea.value = "fix: tidy the working tree";
    textarea.dispatchEvent(new Event("input"));
    await flushPromises();
    (document.querySelector(".repo-dirty-commit") as HTMLButtonElement).click();
    await flushPromises();

    expect(commits).toEqual([{ message: "fix: tidy the working tree" }]);
    expect(useRepoStore().gitStatus?.dirty).toEqual([]);
    // File list and diff are empty, and the single commit pipeline was used.
    expect(document.querySelectorAll(".repo-dirty-file").length).toBe(0);
    expect(document.querySelector(".diff-section")).toBeNull();
    expect(textarea.value).toBe("");
    expect(textarea.disabled).toBe(true);
    expect(panel()!.textContent).toContain("Committed 2 files to main (abc1234).");
  });

  it("commits with a blank message (the server applies its default)", async () => {
    await openPanel();
    (document.querySelector(".repo-dirty-commit") as HTMLButtonElement).click();
    await flushPromises();

    expect(commits).toEqual([{ message: "" }]);
  });

  it("shows a 409 refusal inline instead of failing silently", async () => {
    commitReply = {
      status: 409,
      body: { ok: false, error: "There are unresolved merge conflicts." },
    };
    await openPanel();
    (document.querySelector(".repo-dirty-commit") as HTMLButtonElement).click();
    await flushPromises();

    expect(document.querySelector(".ff-error")?.textContent).toContain(
      "unresolved merge conflicts",
    );
    expect(useRepoStore().gitStatus?.dirty).toHaveLength(2);
  });

  it("shows a 422 hook rejection with its verbatim output", async () => {
    commitReply = {
      status: 422,
      body: {
        ok: false,
        error: "git commit was rejected.",
        output: "style.css: formatting failed",
      },
    };
    await openPanel();
    (document.querySelector(".repo-dirty-commit") as HTMLButtonElement).click();
    await flushPromises();

    expect(document.querySelector(".ff-error")?.textContent).toBe("git commit was rejected.");
    expect(document.querySelector(".repo-dirty-output")?.textContent).toContain(
      "style.css: formatting failed",
    );
  });

  it("disables commit while the working tree is clean", async () => {
    currentStatus = status({ dirty: [] });
    await openPanel();

    const button = document.querySelector(".repo-dirty-commit") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(panel()!.textContent).toContain("Nothing is uncommitted");
  });

  it("does not commit a detached HEAD", async () => {
    currentStatus = status({
      branch: null,
      detached: true,
      dirty: [{ path: "a.ts", status: " M" }],
    });
    await openPanel();

    expect((document.querySelector(".repo-dirty-commit") as HTMLButtonElement).disabled).toBe(true);
    expect(panel()!.textContent).toContain("HEAD is detached");
    expect(fetches.filter((u) => u.includes("/api/repo/commit"))).toEqual([]);
  });
});
