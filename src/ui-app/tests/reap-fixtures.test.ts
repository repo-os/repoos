import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reapStaleFixtures, STALE_FIXTURE_AGE_MS } from "./helpers";

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
});
