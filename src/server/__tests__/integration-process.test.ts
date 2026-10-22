import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "../integration-orchestrator.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("close-out child process cancellation", () => {
  it("keeps the SIGKILL grace alive after the group leader exits", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "repoos-cancel-check-"));
    roots.push(cwd);
    const started = Date.now();
    const result = await runProcess(
      "sh",
      ["-c", `sh -c 'trap "" TERM; while :; do sleep 1; done' & wait`],
      {
        cwd,
        timeout: 30_000,
        isCancelled: () => Date.now() - started >= 250,
      },
    );
    expect(result.cancelled).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1400);
  }, 10_000);
});
