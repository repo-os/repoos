import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const json = async (data: unknown) => ({ ok: true, status: 200, json: async () => data });

const REVIEW_TASK = { id: "0007", title: "T", status: "review", branch: "b", git: {} };

function stubServer(jobs: unknown[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/api/integration-jobs")) return json({ ok: true, jobs });
      if (url.includes("/api/board"))
        return json({ tasks: [REVIEW_TASK], counts: {}, taskCount: 1 });
      throw new Error("unexpected fetch: " + url);
    }),
  );
}

const FAILED_JOB = {
  taskId: "0007",
  phase: "failed",
  failedPhase: "validating",
  reason: "merge conflict in src/a.ts, src/b.ts — resolve it",
  failedAt: "2026-10-02T10:00:00.000Z",
  debugTldr: "two files conflict",
};

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
});

describe("close-out errors survive a refresh", () => {
  it("re-surfaces a failed job's error after the page reloads", async () => {
    stubServer([FAILED_JOB]);
    const repo = useRepoStore();
    await repo.refresh();
    expect(repo.doneErrorFor("0007")).toBeNull();
    await repo.refreshDoneErrors();
    expect(repo.doneErrorFor("0007")).toMatchObject({
      conflicts: ["src/a.ts", "src/b.ts"],
      failedAt: "2026-10-02T10:00:00.000Z",
      tldr: "two files conflict",
    });
  });

  it("ignores jobs that did not fail", async () => {
    stubServer([{ taskId: "0007", phase: "validating" }]);
    const repo = useRepoStore();
    await repo.refresh();
    await repo.refreshDoneErrors();
    expect(repo.doneErrorFor("0007")).toBeNull();
  });

  it("keeps a dismissed error hidden across refreshes", async () => {
    stubServer([FAILED_JOB]);
    const repo = useRepoStore();
    await repo.refresh();
    await repo.refreshDoneErrors();
    repo.dismissDoneError("0007");
    expect(repo.doneErrorFor("0007")).toBeNull();

    setActivePinia(createPinia());
    const reloaded = useRepoStore();
    await reloaded.refresh();
    await reloaded.refreshDoneErrors();
    expect(reloaded.doneErrorFor("0007")).toBeNull();
  });

  it("shows a different failure for the same task even after a dismissal", async () => {
    stubServer([FAILED_JOB]);
    const repo = useRepoStore();
    await repo.refresh();
    await repo.refreshDoneErrors();
    repo.dismissDoneError("0007");

    stubServer([{ ...FAILED_JOB, reason: "check failed: tests red" }]);
    await repo.refreshDoneErrors();
    expect(repo.doneErrorFor("0007")?.detail).toContain("tests red");
  });
});
