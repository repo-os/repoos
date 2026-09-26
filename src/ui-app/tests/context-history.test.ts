/**
 * Context History tab (#0514): day grouping, task-id subjects, the History
 * tab on Context, and the panel's empty/error/commit rendering.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ContextView from "../src/views/ContextView.vue";
import RepoHistoryPanel from "../src/components/RepoHistoryPanel.vue";
import { authorInitials, groupCommitsByDay, splitTaskSubject } from "../src/lib/repo-history";
import type { HistoryCommit } from "../src/lib/repo-history";
import * as apiMod from "../src/api";
import { makeTask } from "./component-test-helpers";
import { useRepoStore } from "../src/stores/repo";
import { useUiStore } from "../src/stores/ui";

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const api = vi.spyOn(apiMod, "api");

function commit(over: Partial<HistoryCommit> = {}): HistoryCommit {
  return {
    sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    shortSha: "aaaaaaa",
    subject: "docs(0514): seed",
    body: "",
    authorName: "Hist Bot",
    authorEmail: "hist@example.com",
    date: "2026-09-26T12:00:00.000Z",
    refs: ["main"],
    parents: [],
    taskId: "0514",
    ...over,
  };
}

const stubs = {
  NewDocPanel: { template: "<div />" },
  NewSkillPanel: { template: "<div />" },
  RepoHistoryPanel: { template: '<div class="stub-hist">history-panel</div>' },
  Select: { template: "<div><slot /></div>" },
  SelectTrigger: { template: "<div><slot /></div>" },
  SelectValue: { template: "<div />" },
  SelectContent: { template: "<div><slot /></div>" },
  SelectViewport: { template: "<div><slot /></div>" },
  SelectItem: { template: "<div><slot /></div>" },
};

describe("repo history grouping (#0514)", () => {
  it("groups commits by local calendar day and labels today", () => {
    const now = new Date(2026, 8, 26, 18, 0, 0);
    const groups = groupCommitsByDay(
      [
        commit({ sha: "1", date: new Date(2026, 8, 26, 1, 0, 0).toISOString() }),
        commit({ sha: "2", date: new Date(2026, 8, 26, 22, 0, 0).toISOString() }),
        commit({
          sha: "3",
          date: new Date(2026, 8, 25, 12, 0, 0).toISOString(),
          subject: "older",
        }),
      ],
      now,
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.label).toBe("Today");
    expect(groups[0]?.commits).toHaveLength(2);
    expect(groups[1]?.label).toBe("Yesterday");
  });

  it("splits type(NNNN): subjects for task links", () => {
    expect(splitTaskSubject("feat(0514): add history")).toEqual({
      type: "feat",
      taskId: "0514",
      rest: "add history",
      raw: "feat(0514): add history",
    });
    expect(splitTaskSubject("chore: tidy")).toMatchObject({ taskId: null });
    expect(authorInitials("Ada Lovelace")).toBe("AL");
  });
});

describe("ContextView History tab (#0514)", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders a History tab alongside Docs, Skills, and Discover", () => {
    const wrapper = mount(ContextView, { global: { stubs } });
    const labels = wrapper.findAll(".ctx-tab").map((t) => t.text());
    expect(labels).toEqual(["Docs", "Skills", "Discover", "History"]);
    expect(wrapper.find("select").exists()).toBe(false);
  });

  it("shows the history panel when History is selected", async () => {
    const wrapper = mount(ContextView, { global: { stubs } });
    const historyTab = wrapper.findAll(".ctx-tab").find((t) => t.text() === "History");
    expect(historyTab).toBeTruthy();
    await historyTab!.trigger("click");
    expect(wrapper.get(".stub-hist").text()).toBe("history-panel");
    expect(wrapper.text()).not.toContain("New doc");
  });
});

describe("RepoHistoryPanel (#0514)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  it("renders day-grouped commits and a task id link", async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/repo/branches")) {
        return { ok: true, defaultBranch: "main", branches: ["main"] };
      }
      if (path.startsWith("/api/repo/log")) {
        return { ok: true, commits: [commit()], nextCursor: null, branch: "main" };
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mount(RepoHistoryPanel, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toContain("seed");
    expect(wrapper.text()).toContain("0514");
    expect(wrapper.text()).toContain("aaaaaaa");
    expect(wrapper.find("select").exists()).toBe(false);
  });

  it("shows a not-a-git-repo empty state", async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/repo/branches")) {
        return { ok: false, error: "not a git repository", code: "not-git" };
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mount(RepoHistoryPanel, { global: { stubs } });
    await flushPromises();
    expect(wrapper.text()).toMatch(/not a git repository/i);
  });

  it("opens the task drawer from a type(NNNN) subject", async () => {
    const task = makeTask({ id: "0514", title: "History tab" });
    useRepoStore().tasks = [task];
    const openTask = vi.spyOn(useUiStore(), "openTask").mockResolvedValue();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/repo/branches")) {
        return { ok: true, defaultBranch: "main", branches: ["main"] };
      }
      if (path.startsWith("/api/repo/log")) {
        return {
          ok: true,
          commits: [commit({ subject: "feat(0514): add history", taskId: "0514" })],
          nextCursor: null,
        };
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mount(RepoHistoryPanel, { global: { stubs } });
    await flushPromises();
    await wrapper.get(".hist-task").trigger("click");
    expect(openTask).toHaveBeenCalledWith(expect.objectContaining({ id: "0514" }));
  });

  it("strips a trailing slash before requesting the path filter", async () => {
    const calls: string[] = [];
    api.mockImplementation(async (path: string) => {
      calls.push(path);
      if (path.startsWith("/api/repo/branches")) {
        return { ok: true, defaultBranch: "main", branches: ["main"] };
      }
      if (path.startsWith("/api/repo/log")) {
        return { ok: true, commits: [commit()], nextCursor: null };
      }
      throw new Error(`unexpected ${path}`);
    });
    const wrapper = mount(RepoHistoryPanel, { global: { stubs } });
    await flushPromises();
    await wrapper.get('input[aria-label="Path filter"]').setValue("src/ui-app/");
    await wrapper.get("form.hist-path").trigger("submit");
    await flushPromises();
    const logCall = calls.filter((c) => c.startsWith("/api/repo/log")).at(-1) ?? "";
    expect(logCall).toContain("path=src%2Fui-app");
    expect(logCall).not.toContain("ui-app%2F");
  });
});
