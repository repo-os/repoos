/**
 * #1018 — a long-lived tab must not grow without bound.
 *
 * Every streamed line used to rebuild the whole transcript record and copy up
 * to 2000 entries (`{...outputs, [id]: [...lines, entry].slice(-2000)}`), and
 * check/test-run logs were appended with no cap at all. A tab open for days
 * therefore both slowed down (O(n) work per streamed line) and grew into
 * hundreds of MB. These tests pin the caps and the in-place append.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRepoStore } from "../src/stores/repo";

const at = "2026-11-04T00:00:00.000Z";

function newRepo() {
  setActivePinia(createPinia());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })),
  );
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
  return useRepoStore();
}

beforeEach(() => {
  vi.stubGlobal(
    "EventSource",
    class {
      addEventListener() {}
      close() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bounded client buffers (#1018)", () => {
  it("appends agent output in place and caps the transcript at 2000 lines", () => {
    const repo = newRepo();
    const transcripts = repo.outputs;

    for (let i = 0; i < 2500; i++) {
      repo.applyEvent({
        type: "agent.output",
        id: "0001",
        entry: { type: "text", text: `line-${i}` },
        stream: "out",
      });
    }

    const lines = repo.outputs["0001"];
    expect(lines).toHaveLength(2000);
    expect((lines[0] as { text?: string }).text).toBe("line-500");
    // The record object is stable: per-line updates never replace it, so
    // components that read another session's transcript are not invalidated.
    expect(repo.outputs).toBe(transcripts);
  });

  it("caps retained check runs per task", () => {
    const repo = newRepo();
    for (let i = 0; i < 40; i++) {
      repo.applyEvent({
        type: "task-check.started",
        taskId: "0001",
        checkId: `check-${i}`,
        checkKind: "handoff-finalize",
        scope: "full",
        machine: "test",
        at,
      });
    }

    const runs = repo.taskChecks["0001"];
    expect(runs).toHaveLength(25);
    expect(runs[0].id).toBe("check-15");
    expect(runs.at(-1)?.id).toBe("check-39");
  });

  it("caps a single check run's streamed output while keeping the tail", () => {
    const repo = newRepo();
    repo.applyEvent({
      type: "task-check.started",
      taskId: "0001",
      checkId: "check-1",
      checkKind: "handoff-finalize",
      scope: "full",
      machine: "test",
      at,
    });

    for (let i = 0; i < 100; i++) {
      repo.applyEvent({
        type: "task-check.output",
        taskId: "0001",
        checkId: "check-1",
        chunk: `${String(i).padStart(4, "0")}:` + "x".repeat(4995),
        at,
      });
    }

    const run = repo.taskChecks["0001"][0];
    expect(run.output.length).toBe(400_000);
    expect(run.output.endsWith("x".repeat(10))).toBe(true);
    expect(run.output).toContain("0099:");
  });

  it("caps the full test-suite output buffer", () => {
    const repo = newRepo();
    repo.applyEvent({ type: "test-run.started", at });
    for (let i = 0; i < 60; i++) {
      repo.applyEvent({ type: "test-run.output", chunk: "y".repeat(10_000), at });
    }
    expect(repo.testRun.output.length).toBe(500_000);
  });

  it("caps the activity feed", () => {
    const repo = newRepo();
    for (let i = 0; i < 100; i++) {
      repo.applyEvent({ type: "agent.running", id: "0001", at });
    }
    expect(repo.feed.length).toBe(30);
  });
});
