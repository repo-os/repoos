/**
 * The durable last-run record (#0447): `repoos check` writes it, the Checks
 * surface reads it. A missing or half-written file must read as "no run" —
 * never throw — so the page degrades instead of failing.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkResultsPath, readCheckRun, writeCheckRun } from "../../core/check-results-store.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
});

function tmpRepo(): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-run-store-"));
  roots.push(d);
  return d;
}

const RECORD = {
  profile: "default",
  source: "declared" as const,
  startedAt: "2026-09-20T00:00:00.000Z",
  finishedAt: "2026-09-20T00:00:01.000Z",
  durationMs: 1000,
  passed: true,
  results: [
    { name: "build", status: "passed" as const, durationMs: 900, required: true, output: "ok" },
  ],
};

describe("check-results-store", () => {
  it("round-trips a run record", () => {
    const root = tmpRepo();
    writeCheckRun(root, RECORD);
    const read = readCheckRun(root);
    expect(read?.profile).toBe("default");
    expect(read?.passed).toBe(true);
    expect(read?.results[0].name).toBe("build");
    expect(read?.results[0].output).toBe("ok");
  });

  it("returns null when nothing has been recorded", () => {
    expect(readCheckRun(tmpRepo())).toBeNull();
  });

  it("returns null rather than throwing on a malformed file", () => {
    const root = tmpRepo();
    const path = checkResultsPath(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{not json", "utf8");
    expect(readCheckRun(root)).toBeNull();
  });
});
