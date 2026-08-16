import { describe, expect, it } from "vitest";
import { parseTask, releasedAtFromActivity } from "../../core/task";
import { markTaskReleased, patchTaskFile } from "../../server/write";
import { releaseTimelineTasks } from "../src/releases";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import type { Task as UiTask } from "../src/types";

const config = (root: string): RepoOSConfig => ({
  root,
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
});

function task(root: string, id: string, body = "## Activity\n"): Task {
  const absPath = join(root, `work/${id}-task.md`);
  writeFileSync(
    absPath,
    `---\nid: "${id}"\ntitle: Task ${id}\ntype: feature\nstatus: review\n---\n${body}`,
  );
  return parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });
}

describe("feature releases", () => {
  it("persists a release marker only through successful completion", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-release-"));
    try {
      const work = join(root, "work");
      mkdirSync(work);
      const pending = task(root, "0001");

      const ordinaryDone = patchTaskFile(config(root), pending.absPath, { status: "done" });
      expect(ordinaryDone.releasedAt).toBeNull();

      patchTaskFile(config(root), pending.absPath, { status: "review" });
      const released = markTaskReleased(config(root), pending.absPath);
      expect(released.status).toBe("done");
      expect(released.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(releasedAtFromActivity(readFileSync(pending.absPath, "utf8"))).toBe(
        released.releasedAt,
      );
      expect(markTaskReleased(config(root), pending.absPath).releasedAt).toBe(released.releasedAt);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("releases again after a task is legitimately reopened post-release (#0195)", () => {
    // A task that goes `done` with no real work, then gets manually reopened
    // (done→ready, a real workflow — see docs/close-out-pipeline.md) and
    // redone, must release cleanly a second time. The Activity log is
    // append-only, so the FIRST release marker is still in the body forever —
    // the guard must key off the task's current status, not that history.
    const root = mkdtempSync(join(tmpdir(), "repoos-release-reopen-"));
    try {
      const work = join(root, "work");
      mkdirSync(work);
      const pending = task(root, "0001");

      patchTaskFile(config(root), pending.absPath, { status: "review" });
      const firstRelease = markTaskReleased(config(root), pending.absPath);
      expect(firstRelease.status).toBe("done");

      // Reopened: done→ready→active→review, real work happens, close-out runs
      // again. The old first release marker is still sitting in the log.
      patchTaskFile(config(root), pending.absPath, { status: "ready" });
      patchTaskFile(config(root), pending.absPath, { status: "active" });
      patchTaskFile(config(root), pending.absPath, { status: "review" });
      const reopened = parseTask({
        content: readFileSync(pending.absPath, "utf8"),
        absPath: pending.absPath,
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(reopened.status).toBe("review");
      // The stale historical marker is exactly the trap: releasedAt reads
      // truthy even though the task is not currently done.
      expect(reopened.releasedAt).toBeTruthy();

      const secondRelease = markTaskReleased(config(root), pending.absPath);
      expect(secondRelease.status).toBe("done");
      // ISO timestamps are second-precision, so same-second releases in a
      // fast test can collide — assert on the write itself instead: a SECOND
      // release:success entry actually landed in the append-only log.
      const releaseCount = (
        readFileSync(pending.absPath, "utf8").match(/release:success/g) ?? []
      ).length;
      expect(releaseCount).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not mistake release prose for a successful close-out", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-release-"));
    try {
      const work = join(root, "work");
      mkdirSync(work);
      const pending = task(
        root,
        "0002",
        "## Activity\r\n\r\n- 2026-01-01T00:00:00Z · blocked until v2 is released\r\n",
      );

      const ordinaryDone = patchTaskFile(config(root), pending.absPath, { status: "done" });
      expect(ordinaryDone.releasedAt).toBeNull();
      expect(releasedAtFromActivity(readFileSync(pending.absPath, "utf8"))).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("shows only released done tasks, newest first", () => {
    const base = { status: "done", releasedAt: null } as UiTask;
    const releases = releaseTimelineTasks([
      { ...base, id: "1", releasedAt: "2026-01-01T00:00:00Z" },
      { ...base, id: "2", releasedAt: null },
      { ...base, id: "3", releasedAt: "2026-02-01T00:00:00Z" },
      { ...base, id: "4", status: "review", releasedAt: "2026-03-01T00:00:00Z" },
    ]);
    expect(releases.map((item) => item.id)).toEqual(["3", "1"]);
  });

  it("bounds the dashboard history", () => {
    const base = { status: "done" } as UiTask;
    const tasks = Array.from({ length: 14 }, (_, index) => ({
      ...base,
      id: String(index),
      releasedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    expect(releaseTimelineTasks(tasks)).toHaveLength(12);
    expect(releaseTimelineTasks(tasks)[0].id).toBe("13");
  });
});
