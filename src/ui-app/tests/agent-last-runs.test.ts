import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RepoOSDb } from "../../core/db.js";

describe("agent last runs", () => {
  let root = "";
  let db: RepoOSDb | null = null;
  afterEach(() => {
    db?.close();
    db = null;
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("returns the latest run per agent, including a failure reason", () => {
    root = mkdtempSync(join(tmpdir(), "repoos-agent-last-runs-"));
    db = new RepoOSDb(root);
    const save = (
      sessionId: string,
      startedAt: string,
      status: string,
      errorReason: string | null,
    ) =>
      db!.upsertSession({
        sessionId,
        sessionType: "engineer",
        taskId: "1098",
        agent: "engineer",
        model: "composer-2.5",
        codingAgent: "cursor",
        startedAt,
        endedAt: startedAt,
        elapsedMs: 10,
        status,
        lastActivityAt: startedAt,
        errorReason,
      });

    save("old", "2026-11-10T00:00:00.000Z", "ok", null);
    save("latest", "2026-11-11T00:00:00.000Z", "errored", "Cannot use this model: composer-2.5");
    expect(db.getAgentLastRuns()).toEqual([
      expect.objectContaining({
        agent: "engineer",
        status: "errored",
        errorReason: "Cannot use this model: composer-2.5",
      }),
    ]);
  });
});
