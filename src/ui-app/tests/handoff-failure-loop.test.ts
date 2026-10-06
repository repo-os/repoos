import { describe, expect, it } from "vitest";
import {
  MAX_IDENTICAL_HANDOFF_VALIDATION_FAILURES,
  assessHandoffFailureLoop,
  countTrailingIdenticalHandoffFailures,
  handoffFailureFingerprint,
  lastHandoffFailureFromBody,
  parseHandoffFailureReason,
  shouldParkForIdenticalHandoffFailures,
  shouldSkipHandoffValidationForUnchangedTree,
} from "../../server/handoff-failure-loop.js";
import type { Task } from "../../core/types.js";

function taskWithBody(body: string, extra?: Record<string, unknown>): Task {
  return {
    id: "0693",
    title: "t",
    type: "bug",
    status: "active",
    needsInput: false,
    needsMerge: false,
    priority: "p1",
    area: "server",
    assignee: "ai",
    assignedTo: "",
    createdBy: "",
    branch: "feat/x",
    tags: [],
    created_at: null,
    updated_at: null,
    body,
    path: "work/0693-t.md",
    absPath: "/tmp/0693-t.md",
    extra,
  } as Task;
}

function failureActivity(detail: string, i = 1): string {
  const ts = `2026-10-0${i}T12:00:00Z`;
  return `- ${ts} · handoff failed · api handoff failed at check · ${detail}`;
}

describe("handoff failure loop (#0693)", () => {
  it("fingerprints step and normalized detail", () => {
    const fp = handoffFailureFingerprint("check", "repoos check failed:  Type  error");
    expect(fp).toBe("check|repoos check failed: Type error");
  });

  it("counts trailing identical failures", () => {
    const body = `## Activity\n\n${failureActivity("other", 3)}\n${failureActivity("same error", 2)}\n${failureActivity("same error", 1)}`;
    expect(countTrailingIdenticalHandoffFailures(body)).toBe(2);
  });

  it("parks after three identical failures on an unchanged branch", () => {
    const lines = [1, 2, 3].map((i) => failureActivity("StorageStatus missing", i));
    const body = `## Activity\n\n${lines.join("\n")}`;
    const task = taskWithBody(body, { last_handoff_failure_sha: "abc123" });
    expect(shouldParkForIdenticalHandoffFailures(task, "abc123")).toBe(true);
    const state = assessHandoffFailureLoop(task, "abc123");
    expect(state.identicalCount).toBe(3);
    expect(state.atCap).toBe(true);
  });

  it("re-enables validation when the branch tip changes", () => {
    const body = `## Activity\n\n${failureActivity("err", 1)}`;
    const task = taskWithBody(body, { last_handoff_failure_sha: "old" });
    expect(shouldSkipHandoffValidationForUnchangedTree(task, "new")).toBe(false);
    expect(shouldParkForIdenticalHandoffFailures(task, "new")).toBe(false);
  });

  it("skips validation when the tip is unchanged and a failure is on record", () => {
    const body = `## Activity\n\n${failureActivity("err", 1)}`;
    const task = taskWithBody(body, { last_handoff_failure_sha: "sha1" });
    expect(shouldSkipHandoffValidationForUnchangedTree(task, "sha1")).toBe(true);
  });

  it("parses the last check failure from activity", () => {
    const detail = "repoos check failed: export missing";
    const body = `## Activity\n\n${failureActivity(detail)}`;
    const parsed = lastHandoffFailureFromBody(body);
    expect(parsed?.step).toBe("check");
    expect(parsed?.detail).toBe(detail);
    expect(parseHandoffFailureReason(`api handoff failed at check · ${detail}`)?.fingerprint).toBe(
      parsed?.fingerprint,
    );
  });

  it("uses the configured cap constant", () => {
    expect(MAX_IDENTICAL_HANDOFF_VALIDATION_FAILURES).toBe(3);
  });
});
