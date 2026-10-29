import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitWorker } from "../../server/git-worker.js";
import { loadConfig } from "../../core/config.js";
import { parseTask } from "../../core/task.js";

const fixtures: Array<{ root: string; worker: GitWorker }> = [];
afterEach(() => {
  for (const { root, worker } of fixtures.splice(0)) {
    worker.close();
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture(taskCount: number, branchCount: number, oldGit: boolean | "unsupported" = false) {
  const root = mkdtempSync(join(tmpdir(), "repoos-board-batch-"));
  mkdirSync(join(root, "bin"));
  mkdirSync(join(root, "work"));
  const id = (n: number) => String(n).padStart(4, "0");
  const sha = (n: number) => n.toString(16).padStart(40, "0");
  const head = sha(99999);
  let revision = head;
  const writeGitState = () => {
    writeFileSync(
      join(root, "refs"),
      [
        `main ${revision}${oldGit ? "" : " 0 0"}`,
        ...Array.from(
          { length: branchCount },
          (_, i) => `feat/${i} ${sha(i + 1)}${oldGit ? "" : ` ${i % 2} 0`}`,
        ),
      ].join("\n"),
    );
    writeFileSync(
      join(root, "worktrees"),
      `worktree ${root}\nHEAD ${revision}\nbranch refs/heads/main\n\n` +
        Array.from(
          { length: branchCount },
          (_, i) =>
            `worktree ${root}/tree-${i}\nHEAD ${sha(i + 1)}\nbranch refs/heads/feat/${i}\n\n`,
        ).join(""),
    );
    writeFileSync(
      join(root, "merged"),
      [
        "main",
        ...Array.from({ length: branchCount }, (_, i) => (i % 2 === 0 ? `feat/${i}` : "")).filter(
          Boolean,
        ),
      ].join("\n"),
    );
  };
  writeGitState();
  const history = Array.from({ length: taskCount }, (_, i) => {
    writeFileSync(
      join(root, `work/${id(i)}-task.md`),
      `---
id: "${id(i)}"
title: Task ${i}
status: done
branch: feat/${i % branchCount}
merged_commit: "${sha(i + 1)}"
depends_on: ${i ? `["${id(i - 1)}"]` : "[]"}
---
`,
    );
    return `\x1ecommit ${i}\x1f2026-10-28T12:00:00Z\nwork/${id(i)}-task.md\n`;
  }).join("");
  writeFileSync(join(root, "history"), history);
  writeFileSync(
    join(root, "reachable"),
    Array.from({ length: taskCount }, (_, i) => (i % 3 === 0 ? sha(i + 1) : ""))
      .filter(Boolean)
      .join("\n"),
  );
  writeFileSync(
    join(root, "missing"),
    Array.from({ length: taskCount }, (_, i) => (i % 3 === 2 ? sha(i + 1) : ""))
      .filter(Boolean)
      .join("\n"),
  );
  writeFileSync(join(root, "calls"), "");
  writeFileSync(
    join(root, "bin/git"),
    `#!/bin/sh
echo "$*" >> "$PWD/calls"
case "$*" in
  'worktree list --porcelain') cat "$PWD/worktrees" ;;
  for-each-ref*) ${oldGit === "unsupported" ? 'case "$*" in *ahead-behind*) exit 128 ;; esac;' : ""} cat "$PWD/refs" ;;
  'branch --merged '*) cat "$PWD/merged" ;;
  'merge-base --is-ancestor '*) exit 0 ;;
  *' log '*) cat "$PWD/history" ;;
  rev-list*) cat "$PWD/reachable" ;;
  cat-file*) awk 'NR==FNR { missing[$0]=1; next } { print $0, ($0 in missing ? "missing" : "commit") }' "$PWD/missing" - ;;
  *) echo "Unexpected git: $*" >&2; exit 1 ;;
esac
`,
    { mode: 0o755 },
  );
  const launch: typeof spawn = ((command: string, args: string[], options: object) =>
    spawn(command, args, {
      ...options,
      env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` },
    })) as typeof spawn;
  const worker = new GitWorker(root, launch);
  fixtures.push({ root, worker });
  return {
    root,
    worker,
    config: loadConfig(root),
    calls: () => readFileSync(join(root, "calls"), "utf8").trim().split("\n").filter(Boolean),
    moveHead: () => {
      revision = sha(99998);
      writeGitState();
      writeFileSync(
        join(root, "history"),
        "\x1eupdated\x1f2026-10-29T12:00:00Z\nwork/0000-task.md\n",
      );
      worker.invalidate();
    },
  };
}

describe("board Git queries", () => {
  it("verifies real merge objects after branch deletion and a base history rewrite", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-board-ancestry-"));
    const worker = new GitWorker(root);
    fixtures.push({ root, worker });
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "RepoOS test");
    writeFileSync(join(root, "base.txt"), "base");
    git("add", "base.txt");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    git("checkout", "-qb", "feature/upstream");
    writeFileSync(join(root, "upstream.txt"), "upstream");
    git("add", "upstream.txt");
    git("commit", "-qm", "upstream");
    const commit = git("rev-parse", "HEAD");
    git("checkout", "-q", "main");
    const tasks = [commit, "0".repeat(40), null].map((sha, i) =>
      parseTask({
        content: `---\nid: "${i}"\ntitle: Task ${i}\nstatus: ${sha ? "done" : "ready"}\n${sha ? `merged_commit: ${sha}` : 'depends_on: ["0", "1"]'}\n---\n`,
        absPath: join(root, `work/${i}-task.md`),
        root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      }),
    );
    const missing = { id: "1", state: "cancelled" };
    const waiting = { id: "0", state: "waiting" };
    expect((await worker.dependencyBlockers(root, tasks)).get("2")).toEqual([waiting, missing]);
    git("merge", "--ff-only", "feature/upstream");
    git("branch", "-d", "feature/upstream");
    worker.invalidate();
    expect((await worker.dependencyBlockers(root, tasks)).get("2")).toEqual([missing]);
    git("reset", "--hard", base);
    worker.invalidate();
    expect((await worker.dependencyBlockers(root, tasks)).get("2")).toEqual([waiting, missing]);
  });

  it.each([
    [10, 2],
    [900, 100],
  ])("uses constant spawns for %i tasks and %i branches", async (taskCount, branchCount) => {
    const f = fixture(taskCount, branchCount);
    const { index, git } = await f.worker.buildIndex(f.config, true);
    expect(index.tasks).toHaveLength(taskCount);
    expect(git.heads.size).toBe(branchCount + 1);
    expect(index.tasks.find((task) => task.id === "0001")?.git).toMatchObject({
      lastCommit: "commit 1",
      dirty: true,
    });
    expect(f.calls()).toHaveLength(4);
    expect(f.calls().filter((call) => call.startsWith("for-each-ref"))).toEqual([
      "for-each-ref --format=%(refname:short) %(objectname) %(ahead-behind:main) refs/heads/",
    ]);
    expect(f.calls().filter((call) => call.includes(" log "))).toHaveLength(1);
    const blockers = await f.worker.dependencyBlockers(f.root, index.tasks);
    expect(blockers.get("0001")).toEqual([]);
    expect(blockers.get("0002")).toEqual([{ id: "0001", state: "waiting" }]);
    expect(blockers.get("0003")).toEqual([{ id: "0002", state: "cancelled" }]);
    expect(f.calls()).toHaveLength(7); // +1: dependency blockers confirm worktree HEADs with one `worktree list`.
    // Neither elapsed time nor a new task-file read expires ref/HEAD facts.
    await f.worker.buildIndex(f.config, true);
    await f.worker.dependencyBlockers(f.root, index.tasks);
    for (let i = 0; i < 10; i++) await f.worker.taskFacts(f.config, `work/000${i}-task.md`, null);
    expect(f.calls()).toHaveLength(7);

    f.moveHead();
    const updated = await f.worker.buildIndex(f.config, true);
    expect(updated.index.tasks.find((task) => task.id === "0000")?.git.lastCommit).toBe("updated");
    expect(updated.index.tasks.find((task) => task.id === "0001")?.git.lastCommit).toBe("commit 1");
    expect(f.calls()).toHaveLength(12);
    expect(f.calls().at(-1)).toContain("..");
    expect(f.calls().filter((call) => call.startsWith("branch --merged"))).toHaveLength(2);
  });

  it("shares one cold overview between task history and branch facts", async () => {
    const f = fixture(10, 2);
    const facts = await f.worker.taskFacts(f.config, "work/0000-task.md", null);
    expect(facts.lastCommit).toBe("commit 0");
    expect(f.calls()).toHaveLength(4);
    await f.worker.buildIndex(f.config, true);
    expect(f.calls()).toHaveLength(4);
  });

  it.each([
    [10, 2],
    [900, 100],
  ])(
    "keeps watcher git spawns constant for %i task and %i branch facts",
    async (taskCount, branchCount) => {
      const f = fixture(taskCount, branchCount);
      await f.worker.buildIndex(f.config, true);
      const coldSpawnCount = f.calls().length;
      for (let i = 0; i < taskCount; i++) {
        await f.worker.taskFacts(
          f.config,
          `work/${String(i).padStart(4, "0")}-task.md`,
          `feat/${i % branchCount}`,
        );
      }
      expect(f.calls()).toHaveLength(coldSpawnCount);
    },
  );

  it("invalidates unchecked-out refs even when all worktree HEADs stay unchanged", async () => {
    const f = fixture(10, 2);
    const { index } = await f.worker.buildIndex(f.config, true);
    const tasks = index.tasks.map((task) => ({ ...task, mergedCommit: null }));
    expect((await f.worker.dependencyBlockers(f.root, tasks)).get("0001")).toEqual([]);
    writeFileSync(join(f.root, "merged"), "main\n");
    writeFileSync(
      join(f.root, "refs"),
      readFileSync(join(f.root, "refs"), "utf8").replace("feat/0", "feat/changed"),
    );
    f.worker.invalidate();
    const updated = await f.worker.gitOverview();
    expect(updated.branches.has("feat/0")).toBe(false);
    expect((await f.worker.dependencyBlockers(f.root, tasks)).get("0001")).toEqual([
      { id: "0000", state: "cancelled" },
    ]);
    expect(f.calls()).toHaveLength(9);
  });

  it("rechecks recorded merge commits after the base history changes", async () => {
    const f = fixture(10, 2);
    const { index } = await f.worker.buildIndex(f.config, true);
    expect((await f.worker.dependencyBlockers(f.root, index.tasks)).get("0001")).toEqual([]);
    writeFileSync(join(f.root, "reachable"), "");
    f.moveHead();
    expect((await f.worker.dependencyBlockers(f.root, index.tasks)).get("0001")).toEqual([
      { id: "0000", state: "waiting" },
    ]);
    expect(f.calls().filter((call) => call.startsWith("rev-list"))).toHaveLength(2);
  });

  it("samples a detached checkout HEAD from the same worktree-list query", async () => {
    const f = fixture(10, 2);
    const list = readFileSync(join(f.root, "worktrees"), "utf8").replace(
      `worktree ${f.root}\n`,
      `worktree ${f.root}/primary\n`,
    );
    writeFileSync(
      join(f.root, "worktrees"),
      `${list}worktree ${f.root}\nHEAD detached-head\ndetached\n\n`,
    );
    const { git } = await f.worker.buildIndex(f.config, true);
    expect(git.head).toBe("detached-head");
    for (let i = 0; i < 5; i++) await f.worker.taskFacts(f.config, "work/0000-task.md", null);
    expect(f.calls()).toHaveLength(4);
    expect(f.calls().some((call) => call.startsWith("rev-parse"))).toBe(false);
  });

  it("uses one merged-branch query to fill missing ahead counts on older Git", async () => {
    const f = fixture(10, 100, true);
    const { git } = await f.worker.buildIndex(f.config, true);
    expect(git.aheadCounts.get("feat/0")).toBe(0);
    expect(git.aheadCounts.get("feat/1")).toBe(1);
    expect(f.calls()).toHaveLength(4);
    expect(f.calls().some((call) => call.includes("rev-list --count"))).toBe(false);
  });

  it.each([2, 100])(
    "keeps fallback spawns constant for %i branches when Git rejects ahead-behind",
    async (branchCount) => {
      const f = fixture(10, branchCount, "unsupported");
      const { git } = await f.worker.buildIndex(f.config, true);
      expect(git.aheadCounts.get("feat/0")).toBe(0);
      expect(git.aheadCounts.get("feat/1")).toBe(1);
      expect(f.calls()).toHaveLength(5);
      expect(f.calls().filter((call) => call.startsWith("for-each-ref"))).toHaveLength(2);
      expect(f.calls().filter((call) => call.startsWith("branch --merged"))).toHaveLength(1);
      await f.worker.buildIndex(f.config, true);
      expect(f.calls()).toHaveLength(5);
    },
  );
});
