import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogEntry } from "../../core/logger.js";
import { rmFixture } from "./helpers";
import {
  backfillCloseOutOutcomeDurations,
  CLOSE_OUT_COMPLETE_LOG,
  deriveCloseOutDurationFromIntegrationLogs,
} from "../../server/close-out-outcome-backfill.js";
import { createCloseOutOutcomeStore } from "../../server/close-out-outcome.js";

function writeTaskLog(root: string, taskId: string, entries: LogEntry[]): void {
  const dir = join(root, ".repoos", "logs", "tasks");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${taskId}.log`),
    entries.map((e) => JSON.stringify(e)).join("\n") + "\n",
  );
}

describe("deriveCloseOutDurationFromIntegrationLogs (#0829)", () => {
  it("uses the processing phase before the matching publish log", () => {
    const finishedAt = "2026-10-18T06:45:13Z";
    const logs: LogEntry[] = [
      {
        timestamp: "2026-10-18T06:37:00Z",
        level: "info",
        component: "integration",
        message: "Processing job phase: validating",
      },
      {
        timestamp: finishedAt,
        level: "info",
        component: "integration",
        message: CLOSE_OUT_COMPLETE_LOG,
      },
    ];
    const derived = deriveCloseOutDurationFromIntegrationLogs(logs, finishedAt);
    expect(derived).toEqual({
      startedAt: "2026-10-18T06:37:00Z",
      durationMs: 493_000,
    });
  });

  it("ignores failed runs and unrelated tasks in the log window", () => {
    const finishedAt = "2026-10-18T03:38:12Z";
    const logs: LogEntry[] = [
      {
        timestamp: "2026-10-18T03:00:00Z",
        level: "info",
        component: "integration",
        message: "Processing job phase: queued",
      },
      {
        timestamp: "2026-10-18T03:10:00Z",
        level: "info",
        component: "integration",
        message: CLOSE_OUT_COMPLETE_LOG,
      },
      {
        timestamp: "2026-10-18T03:20:00Z",
        level: "info",
        component: "integration",
        message: "Processing job phase: merge",
      },
      {
        timestamp: finishedAt,
        level: "info",
        component: "integration",
        message: CLOSE_OUT_COMPLETE_LOG,
      },
    ];
    const derived = deriveCloseOutDurationFromIntegrationLogs(logs, finishedAt);
    expect(derived?.startedAt).toBe("2026-10-18T03:20:00Z");
    expect(derived?.durationMs).toBe(18 * 60_000 + 12_000);
  });
});

describe("backfillCloseOutOutcomeDurations (#0829)", () => {
  it("is idempotent and persists derived durations through the store", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-outcome-backfill-"));
    try {
      const taskId = "0820";
      const finishedAt = "2026-10-18T03:38:12Z";
      writeTaskLog(root, taskId, [
        {
          timestamp: "2026-10-18T03:25:00Z",
          level: "info",
          component: "integration",
          message: "Processing job phase: build",
        },
        {
          timestamp: finishedAt,
          level: "info",
          component: "integration",
          message: CLOSE_OUT_COMPLETE_LOG,
        },
      ]);
      mkdirSync(join(root, ".repoos"), { recursive: true });
      const path = join(root, ".repoos", "close-out-outcomes.json");
      writeFileSync(
        path,
        JSON.stringify([
          {
            taskId,
            outcome: "succeeded",
            finishedAt,
            reason: "",
          },
          {
            taskId: "9999",
            outcome: "failed",
            finishedAt: "2026-10-17T00:00:00Z",
            reason: "gate failed",
          },
        ]),
      );

      const store = createCloseOutOutcomeStore(root);
      const first = store.list();
      expect(first.find((e) => e.taskId === taskId)?.durationMs).toBe(13 * 60_000 + 12_000);
      expect(first.find((e) => e.taskId === "9999")?.durationMs).toBeUndefined();

      const onDisk = JSON.parse(readFileSync(path, "utf8")) as {
        taskId: string;
        durationMs?: number;
      }[];
      expect(onDisk.find((e) => e.taskId === taskId)?.durationMs).toBe(13 * 60_000 + 12_000);

      const again = createCloseOutOutcomeStore(root);
      expect(again.list().find((e) => e.taskId === taskId)?.durationMs).toBe(13 * 60_000 + 12_000);
    } finally {
      rmFixture(root);
    }
  });

  it("leaves rows untouched when logs cannot be derived", () => {
    const events = [
      {
        taskId: "0001",
        outcome: "succeeded" as const,
        finishedAt: "2026-10-18T00:00:00Z",
        reason: "",
      },
    ];
    const root = mkdtempSync(join(tmpdir(), "repoos-outcome-backfill-empty-"));
    try {
      expect(backfillCloseOutOutcomeDurations(root, events)).toBe(events);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
