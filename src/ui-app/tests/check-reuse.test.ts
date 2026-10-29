import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { findRepoRoot } from "../../core/config.js";
import { join } from "node:path";
import {
  checkSnapshot,
  findReusableHandoffCheck,
  handoffCheckMaxAgeMs,
  sameCheckSnapshot,
} from "../../core/check-reuse.js";
import {
  getCheckStore,
  resetCheckStore,
  type RecordCheckRunInput,
} from "../../core/check-store.js";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  resetCheckStore();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "repoos-check-reuse-"));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  writeFileSync(join(root, ".gitignore"), ".repoos/\n");
  writeFileSync(join(root, "source.ts"), "base\n");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  git(root, "checkout", "-qb", "feat/check");
  writeFileSync(join(root, "source.ts"), "feature\n");
  git(root, "commit", "-qam", "feature");
  const snapshot = (await checkSnapshot(root, "main"))!;
  expect(snapshot).not.toBeNull();
  const store = getCheckStore(root);
  const record = (overrides: Partial<RecordCheckRunInput> = {}) =>
    store.record({
      taskId: "0976",
      phase: "cli",
      worktree: root,
      scope: "changed:main",
      candidateSha: snapshot.candidateSha,
      reuseContext: { mainSha: snapshot.mainSha, mergeBase: snapshot.mergeBase },
      startedAt: new Date().toISOString(),
      durationMs: 100,
      outcome: "pass",
      ...overrides,
    });
  return {
    root,
    snapshot,
    store,
    record,
    find: () => findReusableHandoffCheck(root, ".repoos", "0976", root),
  };
}

describe("handoff self-check reuse", () => {
  it.each(["full", "changed:main", "merge-base"])(
    "reuses identical clean inputs with %s coverage",
    async (scope) => {
      const f = await fixture();
      f.record({ scope: scope === "merge-base" ? `changed:${f.snapshot.mergeBase}` : scope });
      expect(await f.find()).toMatchObject({ id: 1, candidateSha: f.snapshot.candidateSha });
    },
  );
  it.each(["commit", "dirty", "untracked", "main", "missing-main"])(
    "does not reuse after %s changes",
    async (change) => {
      const f = await fixture();
      f.record();
      if (change === "commit") git(f.root, "commit", "--allow-empty", "-qm", "new commit");
      if (change === "dirty") writeFileSync(join(f.root, "source.ts"), "dirty\n");
      if (change === "untracked") writeFileSync(join(f.root, "extra.ts"), "extra\n");
      if (change === "main") {
        git(f.root, "checkout", "-q", "main");
        writeFileSync(join(f.root, "source.ts"), "new main source\n");
        git(f.root, "commit", "-qam", "main moved");
        git(f.root, "checkout", "-q", "feat/check");
      }
      if (change === "missing-main") git(f.root, "branch", "-D", "main");
      expect(await f.find()).toBeNull();
      expect(sameCheckSnapshot(f.snapshot, await checkSnapshot(f.root))).toBe(false);
    },
  );
  it.each([
    { outcome: "fail" },
    { outcome: "skipped" },
    { candidateSha: null },
    { reuseContext: null },
    { scope: "changed:HEAD" },
    { taskId: "other" },
    { phase: "close-out" },
    { worktree: "/other" },
    { startedAt: "invalid" },
    { startedAt: new Date(Date.now() - 3_600_001).toISOString() },
    { startedAt: new Date(Date.now() + 60_000).toISOString() },
  ] satisfies Partial<RecordCheckRunInput>[])(
    "rejects incomplete, stale or unrelated evidence %j",
    async (override) => {
      const f = await fixture();
      f.record(override);
      expect(await f.find()).toBeNull();
    },
  );
  it("allows main's task bookkeeping to advance without reusing source changes", async () => {
    const f = await fixture();
    f.record();
    git(f.root, "checkout", "-q", "main");
    mkdirSync(join(f.root, "work"));
    writeFileSync(join(f.root, "work", "0001-board.md"), "Board activity\n");
    git(f.root, "add", "work");
    git(f.root, "commit", "-qm", "board bookkeeping");
    git(f.root, "checkout", "-q", "feat/check");
    expect(await f.find()).toMatchObject({ id: 1 });
  });
  it.each([false, true])(
    "CLI records clean self-check proof, partial=%s",
    async (partial) => {
      const f = await fixture();
      mkdirSync(join(f.root, "work"));
      writeFileSync(
        join(f.root, "work", "0976-test.md"),
        '---\nid: "0976"\ntitle: Test\nstatus: active\n---\nTest\n',
      );
      writeFileSync(
        join(f.root, "package.json"),
        JSON.stringify({ scripts: { test: 'bun -e "process.exit(0)"' } }),
      );
      writeFileSync(
        join(f.root, "repoos.toml"),
        '[[check.steps]]\nname = "tests"\nkind = "tests"\n',
      );
      git(f.root, "add", "-A");
      git(f.root, "commit", "-qm", "check fixture");
      const cli = join(findRepoRoot(), "src", "cli", "index.ts");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        REPOOS_CHECK_TASK_ID: "0976",
        REPOOS_CHECK_PHASE: "cli",
        REPOOS_CHECK_CHANGED: "main",
        REPOOS_CHECK_STORE_ROOT: f.root,
      };
      delete env.REPOOS_SKIP_TESTS;
      execFileSync(
        "bun",
        [cli, "check", "--local-tests", ...(partial ? ["--step", "tests"] : [])],
        { cwd: f.root, env, encoding: "utf8", timeout: 25_000 },
      );
      const row = f.store.list({ taskId: "0976" })[0]!;
      expect(row.outcome).toBe("pass");
      if (partial) {
        expect(row.reuseContext).toBeNull();
        expect(await f.find()).toBeNull();
      } else {
        expect(row.candidateSha).toBe(git(f.root, "rev-parse", "HEAD"));
        expect(await f.find(), JSON.stringify(row)).toMatchObject({ id: row.id });
      }
    },
    30_000,
  );
  it("fails closed on a lookup error", async () => {
    const f = await fixture();
    f.record();
    vi.spyOn(f.store, "list").mockImplementation(() => {
      throw new Error("database unavailable");
    });
    expect(await f.find()).toBeNull();
  });
  it("requires the scoped ref to cover the current main merge base", async () => {
    const f = await fixture();
    expect(await checkSnapshot(f.root, "HEAD")).toBeNull();
    expect(await checkSnapshot(f.root, "missing-ref")).toBeNull();
  });
  it("uses a configurable age and fails closed on invalid limits", async () => {
    const f = await fixture();
    f.record();
    expect(handoffCheckMaxAgeMs({})).toBe(3_600_000);
    expect(handoffCheckMaxAgeMs({ REPOOS_HANDOFF_CHECK_MAX_AGE_MS: "42" })).toBe(42);
    for (const age of [0, -1, NaN, Infinity]) {
      expect(await findReusableHandoffCheck(f.root, ".repoos", "0976", f.root, age)).toBeNull();
    }
  });
});
