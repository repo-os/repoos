/**
 * #0640 — durable close-out (Move to done) outcome events.
 *
 * The notices bell needs a server-owned record of how a close-out ended
 * (succeeded / failed / timed out) so it can show it live over SSE and backfill
 * it after a reload. These tests pin the durable store and the orchestrator's
 * reporting on each terminal path; a user cancel must produce nothing.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmFixture } from "./helpers";
import { createJobCoordinator } from "../../server/integration-job.js";
import { CloseOutOrchestrator } from "../../server/integration-orchestrator.js";
import {
  createCloseOutOutcomeStore,
  type CloseOutOutcomeEvent,
} from "../../server/close-out-outcome.js";
import type { RepoOSConfig } from "../../core/types";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-outcome-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  writeFileSync(join(root, "README.md"), "# t\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "init"]);
  return { root, clean: () => rmFixture(root) };
}

/** An orchestrator wired to collect reported outcomes. */
function makeOrchestrator(
  root: string,
  closeOut?: { timeoutMs: number },
): {
  orch: CloseOutOrchestrator;
  coordinator: ReturnType<typeof createJobCoordinator>;
  outcomes: CloseOutOutcomeEvent[];
} {
  const config = {
    root,
    workDir: "work",
    cacheDir: ".repoos",
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    ...(closeOut ? { closeOut } : {}),
  } as RepoOSConfig;
  const coordinator = createJobCoordinator(root);
  const outcomes: CloseOutOutcomeEvent[] = [];
  const orch = new CloseOutOrchestrator(
    config,
    coordinator,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    (event) => outcomes.push(event),
  );
  return { orch, coordinator, outcomes };
}

const AGED = (ms: number): string => new Date(Date.now() - ms).toISOString();

describe("createCloseOutOutcomeStore", () => {
  it("round-trips outcomes newest-first", () => {
    const { root, clean } = makeRepo();
    try {
      const store = createCloseOutOutcomeStore(root);
      store.record({
        taskId: "0001",
        outcome: "succeeded",
        finishedAt: "2026-10-03T17:00:00.000Z",
        reason: "",
      });
      store.record({
        taskId: "0002",
        outcome: "failed",
        finishedAt: "2026-10-03T18:00:00.000Z",
        reason: "check failed",
      });
      expect(store.list().map((e) => e.taskId)).toEqual(["0002", "0001"]);
    } finally {
      clean();
    }
  });

  it("dedupes by taskId + finishedAt (a repeated record of the same run)", () => {
    const { root, clean } = makeRepo();
    try {
      const store = createCloseOutOutcomeStore(root);
      const event = {
        taskId: "0001",
        outcome: "timedOut" as const,
        finishedAt: "2026-10-03T17:00:00.000Z",
        reason: "close-out timed out after 6m",
      };
      store.record(event);
      store.record(event);
      expect(store.list()).toHaveLength(1);
    } finally {
      clean();
    }
  });

  it("reads as empty (never throws) when the on-disk file is corrupt", () => {
    const { root, clean } = makeRepo();
    try {
      mkdirSync(join(root, ".repoos"), { recursive: true });
      writeFileSync(join(root, ".repoos", "close-out-outcomes.json"), "{not json");
      const store = createCloseOutOutcomeStore(root);
      expect(store.list()).toEqual([]);
    } finally {
      clean();
    }
  });

  it("preserves a corrupt file aside instead of clobbering its history on the next record", () => {
    const { root, clean } = makeRepo();
    try {
      mkdirSync(join(root, ".repoos"), { recursive: true });
      const path = join(root, ".repoos", "close-out-outcomes.json");
      writeFileSync(path, "{not json: prior history");
      const errors: unknown[] = [];
      const store = createCloseOutOutcomeStore(root, ".repoos", (e) => errors.push(e));

      store.record({
        taskId: "0001",
        outcome: "succeeded",
        finishedAt: "2026-10-03T17:00:00.000Z",
        reason: "",
      });

      // The unreadable read was reported, and the prior bytes were moved
      // aside rather than overwritten.
      expect(errors.length).toBeGreaterThanOrEqual(1);
      const backups = readdirSync(join(root, ".repoos")).filter((f) =>
        f.startsWith("close-out-outcomes.json.corrupt-"),
      );
      expect(backups).toHaveLength(1);
      expect(readFileSync(join(root, ".repoos", backups[0]), "utf8")).toBe(
        "{not json: prior history",
      );
      // The new event is written fresh and served.
      const written = JSON.parse(readFileSync(path, "utf8")) as { taskId: string }[];
      expect(written.map((e) => e.taskId)).toEqual(["0001"]);
      expect(store.list().map((e) => e.taskId)).toEqual(["0001"]);
    } finally {
      clean();
    }
  });

  it("keeps a recorded event in memory and reports a persistence failure", () => {
    const { root, clean } = makeRepo();
    try {
      const errors: unknown[] = [];
      const store = createCloseOutOutcomeStore(root, ".repoos", (e) => errors.push(e));
      // Turn the cache path into a file so the nested write must fail.
      writeFileSync(join(root, ".repoos"), "not a directory");
      store.record({
        taskId: "0001",
        outcome: "succeeded",
        finishedAt: "2026-10-03T17:00:00.000Z",
        reason: "",
      });
      expect(errors).toHaveLength(1);
      // The event is not silently lost — it still serves from this instance.
      expect(store.list().map((e) => e.taskId)).toEqual(["0001"]);
    } finally {
      clean();
    }
  });
});

describe("orchestrator reports a close-out outcome (#0640)", () => {
  it("reports succeeded after a job reaches the done phase", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, outcomes } = makeOrchestrator(root);
      coordinator.enqueue({ id: "T1", branch: "feat/T1" } as never);
      coordinator.updateJob("T1", { phase: "cleanup", startedAt: new Date().toISOString() });
      // The merge already landed; skip the real worktree/bookkeeping cleanup.
      (orch as never as Record<string, unknown>).cleanup = async () => ({ ok: true });

      const result = await orch.processNext();

      expect(result.ok).toBe(true);
      expect(coordinator.getJob("T1")?.phase).toBe("done");
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ taskId: "T1", outcome: "succeeded", reason: "" });
      expect(Number.isNaN(Date.parse(outcomes[0].finishedAt))).toBe(false);
    } finally {
      clean();
    }
  });

  it("reports failed with the reason when the gate fails for real", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, outcomes } = makeOrchestrator(root);
      coordinator.enqueue({ id: "T2", branch: "feat/T2" } as never);
      coordinator.updateJob("T2", { phase: "validating", startedAt: new Date().toISOString() });
      // Identical failures on both attempts → a real branch failure.
      (orch as never as Record<string, unknown>).validateCandidate = async () => ({
        ok: false,
        reason: "check failed: TypeError: boom",
      });

      const result = await orch.processNext();

      expect(result.ok).toBe(false);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ taskId: "T2", outcome: "failed" });
      expect(outcomes[0].reason).toContain("TypeError: boom");
      expect(outcomes[0].finishedAt).toBe(coordinator.getJob("T2")?.failedAt);
    } finally {
      clean();
    }
  });

  it("reports timedOut (not failed) when the budget is exhausted", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, outcomes } = makeOrchestrator(root, { timeoutMs: 60_000 });
      coordinator.enqueue({ id: "T3", branch: "feat/T3" } as never);
      coordinator.updateJob("T3", {
        phase: "validating",
        startedAt: AGED(60 * 60 * 1000), // an hour ago, well past the 60s budget
      });

      const result = await orch.processNext();

      expect(result.ok).toBe(false);
      expect(coordinator.getJob("T3")?.phase).toBe("failed");
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({ taskId: "T3", outcome: "timedOut" });
      expect(outcomes[0].reason).toContain("close-out timed out after");
    } finally {
      clean();
    }
  });

  it("reports nothing for a user cancel (Stop MTD)", async () => {
    const { root, clean } = makeRepo();
    try {
      const { orch, coordinator, outcomes } = makeOrchestrator(root);
      coordinator.enqueue({ id: "T4", branch: "feat/T4" } as never);
      coordinator.requestCancel("T4");

      await orch.processNext();

      expect(outcomes).toHaveLength(0);
      expect(coordinator.getJob("T4")).toBeNull();
    } finally {
      clean();
    }
  });
});

describe("outcomes file cap", () => {
  it("keeps the most recent events bounded", () => {
    const { root, clean } = makeRepo();
    try {
      const store = createCloseOutOutcomeStore(root);
      for (let i = 0; i < 60; i++) {
        store.record({
          taskId: `T${i}`,
          outcome: "succeeded",
          finishedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
          reason: "",
        });
      }
      expect(store.list().length).toBeLessThanOrEqual(50);
      // The newest event is retained.
      expect(store.list()[0].taskId).toBe("T59");
      // And the file stays parseable JSON.
      expect(() =>
        JSON.parse(readFileSync(join(root, ".repoos", "close-out-outcomes.json"), "utf8")),
      ).not.toThrow();
    } finally {
      clean();
    }
  });
});
