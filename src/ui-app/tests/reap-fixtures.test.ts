import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reapStaleFixtures, STALE_FIXTURE_AGE_MS } from "./helpers";
import { teardown } from "./setup/global-reap";

/**
 * `reapStaleFixtures` is the only thing that survives every worker-kill path,
 * so its coverage of leaked dirs matters. The `-worktrees` sibling case
 * (config.ts `worktreesDir`) went uncovered and filled a real tmpdir with
 * ~18k orphans before it was noticed.
 */

const PREFIX = "repoos-reap-spec-";
const made: string[] = [];

function stale(name: string, withLog = false): string {
  const dir = join(tmpdir(), name);
  mkdirSync(dir, { recursive: true });
  if (withLog) writeFileSync(join(dir, "spawns.log"), "");
  const old = new Date(Date.now() - STALE_FIXTURE_AGE_MS - 60_000);
  utimesSync(dir, old, old);
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("reapStaleFixtures", () => {
  it("removes an orphaned <fixture>-worktrees dir whose primary is already gone", () => {
    const orphan = stale(`${PREFIX}AbCdEf-worktrees`);
    const removed = reapStaleFixtures(PREFIX);
    expect(existsSync(orphan)).toBe(false);
    expect(removed).toBeGreaterThanOrEqual(1);
  });

  it("removes a primary fixture and its matching -worktrees sibling together", () => {
    const primary = stale(`${PREFIX}GhIjKl`, true);
    const sibling = stale(`${PREFIX}GhIjKl-worktrees`);
    reapStaleFixtures(PREFIX);
    expect(existsSync(primary)).toBe(false);
    expect(existsSync(sibling)).toBe(false);
  });

  it("leaves a fresh dir alone", () => {
    const fresh = join(tmpdir(), `${PREFIX}FreshXy-worktrees`);
    mkdirSync(fresh, { recursive: true });
    made.push(fresh);
    reapStaleFixtures(PREFIX);
    expect(existsSync(fresh)).toBe(true);
  });

  it("reaps a per-file tmpdir tree and kills the fixtures' spawned processes (#0858)", async () => {
    const runRoot = join(tmpdir(), `${PREFIX}RunRoot`);
    const fileRoot = join(runRoot, "file-ABC123");
    const fixture = join(fileRoot, `${PREFIX}Fixture`);
    mkdirSync(fixture, { recursive: true });
    made.push(runRoot);
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      writeFileSync(join(fixture, "spawns.log"), `${JSON.stringify({ pid: child.pid })}\n`);
      // Match production: runRoot/file-XXXXXX/repoos-XXXXXX/spawns.log.
      const old = new Date(Date.now() - STALE_FIXTURE_AGE_MS - 60_000);
      utimesSync(runRoot, old, old);

      expect(reapStaleFixtures(PREFIX)).toBeGreaterThanOrEqual(1);
      expect(existsSync(runRoot)).toBe(false);
      await expect(
        Promise.race([
          exited,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("spawned fixture process survived the reap")), 2_000),
          ),
        ]),
      ).resolves.toBeUndefined();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("kills recorded fixture processes nested deeper than the old four-level scan (#0859)", async () => {
    const runRoot = join(tmpdir(), `${PREFIX}DeepRoot`);
    // More than four levels below the root, like a fixture tree under a
    // per-file temp dir whose companion fixtures nest further.
    const fixture = join(
      runRoot,
      "file-ABC123",
      "nested",
      "deeper",
      "still",
      "and-further",
      "again",
      `${PREFIX}Fixture`,
    );
    mkdirSync(fixture, { recursive: true });
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      writeFileSync(join(fixture, "spawns.log"), `${JSON.stringify({ pid: child.pid })}\n`);
      await teardown(runRoot);
      expect(existsSync(runRoot)).toBe(false);
      await expect(
        Promise.race([
          exited,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("deeply nested fixture process survived teardown")),
              2_000,
            ),
          ),
        ]),
      ).resolves.toBeUndefined();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });

  it("kills recorded fixture processes before teardown removes the run root", async () => {
    const runRoot = join(tmpdir(), `${PREFIX}TeardownRoot`);
    const fixture = join(runRoot, "file-ABC123", `${PREFIX}Fixture`);
    mkdirSync(fixture, { recursive: true });
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    try {
      writeFileSync(join(fixture, "spawns.log"), `${JSON.stringify({ pid: child.pid })}\n`);
      await teardown(runRoot);
      expect(existsSync(runRoot)).toBe(false);
      await expect(
        Promise.race([
          exited,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("spawned fixture process survived teardown")), 2_000),
          ),
        ]),
      ).resolves.toBeUndefined();
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  });
});
