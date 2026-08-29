/**
 * Post-merge close-out reliability (#0130).
 *
 * `POST /api/tasks/:id/done` must either complete the whole lifecycle or
 * return an actionable failure that names the failing stage. These tests cover
 * the two failure shapes observed on #0117/#0114:
 *
 *   1. an already-merged retry (an earlier close-out integrated the branch but
 *      stranded the task in review) — the merge step must be a no-op and the
 *      remaining steps must resume instead of mislabelling a failed merge;
 *   2. a subprocess gate failure — the exit status, exact command, and a
 *      redacted tail of stdout/stderr must survive into the result so the
 *      failing stage is diagnosable without leaking credentials.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deleteBranch, ensureWorktree, removeWorktree } from "../../core/git";
import { parseTask } from "../../core/task";
import type { RepoOSConfig, Task } from "../../core/types";
import {
  captureOutput,
  completeTask,
  describeRetryFailure,
  mergeTaskBranchWithAutoSync,
  redactSecrets,
  runCloseOutCheck,
  runDoneStep,
} from "../../server/done";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** Real repo with user identity configured and an initial commit. */
function makeRepo(): { root: string; clean: () => void } {
  const root = mkdtempSync(join(tmpdir(), "repoos-done-rel-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "t@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["commit", "--allow-empty", "-m", "init"]);
  return { root, clean: () => rmSync(root, { recursive: true, force: true }) };
}

/** Commit a file with the given content in `dir` (any checkout/worktree). */
function commitFile(dir: string, name: string, content: string, msg: string): void {
  writeFileSync(join(dir, name), content);
  git(dir, ["add", "--", name]);
  git(dir, ["commit", "-m", msg]);
}

const config = (root: string): RepoOSConfig => ({
  root,
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
});

/** A review task on `branch`, committed in main, with a linked worktree. */
function reviewTask(root: string, id: string, branch: string): { task: Task; clean: () => void } {
  mkdirSync(join(root, "work"), { recursive: true });
  const absPath = join(root, `work/${id}-task.md`);
  const body = `---\nid: "${id}"\ntitle: Task ${id}\ntype: feature\nstatus: review\nbranch: ${branch}\n---\n## Activity\n`;
  writeFileSync(absPath, body);
  git(root, ["add", "--", `work/${id}-task.md`]);
  git(root, ["commit", "-m", `docs(${id}): add task`]);

  const task = parseTask({
    content: readFileSync(absPath, "utf8"),
    absPath,
    root,
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
  });

  const wt = ensureWorktree(root, branch);
  expect(wt.ok).toBe(true);
  commitFile(wt.path, "b.txt", "branch work\n", "branch work");
  return { task, clean: () => rmSync(root, { recursive: true, force: true }) };
}

/**
 * Install a fake `dist/cli/index.js` in `root` that logs every invocation to
 * `log` (an absolute path) and then runs `body`. `checkCandidates` prefers the
 * merged checkout's own CLI, so `runCloseOutCheck` runs THIS script via
 * `process.execPath` — which lets a test script the exact failure sequence the
 * gate should retry (or not).
 */
function fakeCheckCli(root: string, body: string): { log: string } {
  const cliDir = join(root, "dist", "cli");
  mkdirSync(cliDir, { recursive: true });
  const log = join(cliDir, "runs.log");
  const script = `
    const fs = require("node:fs");
    let n = 0;
    try { n = Number(fs.readFileSync(${JSON.stringify(log)}, "utf8")); } catch {}
    n += 1;
    fs.writeFileSync(${JSON.stringify(log)}, String(n));
    ${body}
  `;
  writeFileSync(join(cliDir, "index.js"), script);
  return { log };
}

describe("mergeTaskBranchWithAutoSync — idempotent retry", () => {
  it("reports alreadyMerged when the branch is already integrated into main", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/merged");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "b.txt", "work\n", "branch work");

      // Simulate an earlier close-out that merged the branch and stranded the
      // task in review: main now contains the branch tip.
      git(root, ["merge", "--no-edit", "feat/merged"]);

      const result = await mergeTaskBranchWithAutoSync(root, "feat/merged");

      expect(result.merged).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(result.ff).toBe(true);
      // The branch is untouched — nothing was re-merged.
      expect(git(root, ["rev-parse", "feat/merged"])).toBe(git(root, ["rev-parse", "main"]));
    } finally {
      clean();
    }
  });

  it("reports alreadyMerged when the branch and worktree were already cleaned up", async () => {
    const { root, clean } = makeRepo();
    try {
      const wt = ensureWorktree(root, "feat/gone");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "b.txt", "work\n", "branch work");
      git(root, ["merge", "--no-edit", "feat/gone"]);

      // The close-out cleanup already ran (deleteBranch refuses unmerged
      // branches, so a missing branch was integrated).
      removeWorktree(root, "feat/gone");
      deleteBranch(root, "feat/gone");

      const result = await mergeTaskBranchWithAutoSync(root, "feat/gone");

      expect(result.merged).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.conflicts).toEqual([]);
      // Nothing is left behind to re-merge.
      expect(git(root, ["branch", "--list", "feat/gone"])).toBe("");
    } finally {
      clean();
    }
  });

  it("does not treat a present-but-unmerged branch as already merged", async () => {
    const { root, clean } = makeRepo();
    try {
      commitFile(root, "f.txt", "base\n", "base file");
      const wt = ensureWorktree(root, "feat/conflict");
      expect(wt.ok).toBe(true);
      commitFile(wt.path, "f.txt", "branch\n", "branch edit");
      commitFile(root, "f.txt", "main\n", "main edit");

      const result = await mergeTaskBranchWithAutoSync(root, "feat/conflict");

      // A branch that still needs merging must NOT be resumed as already-merged.
      expect(result.merged).toBe(false);
      expect(result.alreadyMerged).toBeUndefined();
      expect(result.conflicts).toEqual(["f.txt"]);
    } finally {
      clean();
    }
  });
});

describe("runDoneStep — diagnosable gate failures", () => {
  it("preserves stage, command, exit status, and the output tail", async () => {
    const { root, clean } = makeRepo();
    try {
      const script =
        'for (let i = 0; i < 50; i++) console.log("noise line " + i);' +
        ' console.error("TypeError: gate X broke"); process.exit(1);';
      const result = await runDoneStep({
        cwd: root,
        candidates: [[process.execPath, "-e", script]],
        label: "repoos check",
        stage: "check",
      });

      expect(result.ok).toBe(false);
      expect(result.stage).toBe("check");
      expect(result.exitCode).toBe(1);
      expect(result.command).toContain("-e");
      // The tail is what matters — errors print last, not first.
      expect(result.output).toContain("TypeError: gate X broke");
      expect(result.output).not.toContain("noise line 0");
      expect(result.detail).toContain("exit 1");
      expect(result.detail).toContain("repoos check failed");
      expect(result.transient).toBe(false);
    } finally {
      clean();
    }
  });

  it("classifies a timeout as transient infrastructure failure", async () => {
    const { root, clean } = makeRepo();
    try {
      const result = await runDoneStep({
        cwd: root,
        candidates: [[process.execPath, "-e", "setTimeout(() => {}, 1000)"]],
        label: "repoos check",
        stage: "check",
        timeout: 10,
      });
      expect(result.ok).toBe(false);
      expect(result.transient).toBe(true);
      expect(result.detail).toContain("timed out");
    } finally {
      clean();
    }
  });

  it("classifies a test polling deadline as transient but not an assertion", async () => {
    const { root, clean } = makeRepo();
    try {
      const timeout = await runDoneStep({
        cwd: root,
        candidates: [
          [
            process.execPath,
            "-e",
            "console.error('timed out waiting for fixture'); process.exit(1)",
          ],
        ],
        label: "repoos check",
        stage: "check",
      });
      const assertion = await runDoneStep({
        cwd: root,
        candidates: [
          [process.execPath, "-e", "console.error('Expected true to be false'); process.exit(1)"],
        ],
        label: "repoos check",
        stage: "check",
      });
      expect(timeout.transient).toBe(true);
      expect(assertion.transient).toBe(false);
    } finally {
      clean();
    }
  });

  it("falls through to the next candidate when the first is not available", async () => {
    const { root, clean } = makeRepo();
    try {
      const result = await runDoneStep({
        cwd: root,
        candidates: [
          ["definitely-not-a-real-repoos-bin", "check"],
          [process.execPath, "-e", "console.log('ok')"],
        ],
        label: "repoos check",
        stage: "check",
      });

      expect(result.ok).toBe(true);
    } finally {
      clean();
    }
  });

  it("reports which tool is missing when every candidate cannot start", async () => {
    const { root, clean } = makeRepo();
    try {
      const result = await runDoneStep({
        cwd: root,
        candidates: [["definitely-not-a-real-repoos-bin", "check"]],
        label: "repoos check",
        stage: "check",
      });

      expect(result.ok).toBe(false);
      expect(result.detail).toMatch(/is not available/);
    } finally {
      clean();
    }
  });

  it("passes the provided env to the child so the close-out can skip the redundant build", async () => {
    const { root, clean } = makeRepo();
    try {
      // The close-out already ran a full build, so it invokes `repoos check`
      // with REPOOS_SKIP_BUILD=1 to skip check's own "Full build" step (#0213).
      // This proves the env reaches the spawned gate process.
      // Echo the env var and exit non-zero so it lands in the captured output
      // tail (a successful candidate only returns `{ ok: true }`).
      const result = await runDoneStep({
        cwd: root,
        candidates: [
          [
            process.execPath,
            "-e",
            "process.stderr.write('REPOOS_SKIP_BUILD=' + (process.env.REPOOS_SKIP_BUILD ?? 'unset')); process.exit(1)",
          ],
        ],
        label: "repoos check",
        stage: "check",
        env: { ...process.env, REPOOS_SKIP_BUILD: "1" },
      });

      expect(result.ok).toBe(false);
      expect(result.output).toContain("REPOOS_SKIP_BUILD=1");
    } finally {
      clean();
    }
  });
});

describe("describeRetryFailure — honest retry classification (#0216)", () => {
  const failed = (output: string): CheckSummaryLike => ({
    ok: false,
    stage: "check",
    output,
    detail: "repoos check failed (exit 1)",
    transient: true,
  });

  it("passes a successful retry straight through", () => {
    const retry = { ok: true, stage: "check" as const };
    expect(describeRetryFailure(failed("boom"), retry)).toBe(retry);
  });

  it("passes a non-transient retry failure straight through", () => {
    const retry = { ...failed("boom"), transient: false };
    expect(describeRetryFailure(failed("boom"), retry)).toBe(retry);
  });

  it("calls a retry that reproduced the first failure identically a real defect", () => {
    const out =
      "✗ watcher: waitFor timed out waiting for deletion\n   at tests/watcher.test.ts:147";
    const result = describeRetryFailure(failed(out), failed(out));
    expect(result.detail).toMatch(/identical output/);
    expect(result.detail).toMatch(/genuine defect/);
    expect(result.detail).not.toMatch(/machine may be too loaded/);
  });

  it("reads a retry that failed on different output as contention", () => {
    const result = describeRetryFailure(failed("a: first"), failed("b: second"));
    expect(result.detail).toMatch(/different output/);
    expect(result.detail).toMatch(/too loaded/);
    expect(result.detail).not.toMatch(/genuine defect/);
  });

  it("says so when the two runs cannot be compared", () => {
    const result = describeRetryFailure({ ...failed("a"), output: undefined }, failed("b"));
    expect(result.detail).toMatch(/could not be compared/);
  });
});

describe("runCloseOutCheck — retry-once wiring (#0216)", () => {
  it("retries a transient timeout once and lets a green retry pass the gate", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-done-retry-"));
    try {
      const { log } = fakeCheckCli(
        root,
        `
        if (n === 1) { console.error("timed out waiting for deletion detected by reconciliation poll"); process.exit(1); }
        process.exit(0);
      `,
      );
      const result = await runCloseOutCheck(root);
      expect(result.ok).toBe(true);
      // Exactly two invocations: the failed first run plus one retry.
      expect(readFileSync(log, "utf8").trim()).toBe("2");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not retry a genuine assertion failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-done-assert-"));
    try {
      const { log } = fakeCheckCli(
        root,
        `
        console.error("Expected true to be false");
        process.exit(1);
      `,
      );
      const result = await runCloseOutCheck(root);
      expect(result.ok).toBe(false);
      expect(result.transient).toBe(false);
      expect(result.detail).toContain("Expected true to be false");
      // No retry: a real regression is immediately actionable.
      expect(readFileSync(log, "utf8").trim()).toBe("1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags a timeout that reproduces identically as a genuine defect", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-done-identical-"));
    try {
      const { log } = fakeCheckCli(
        root,
        `
        console.error("timed out waiting for fixture");
        process.exit(1);
      `,
      );
      const result = await runCloseOutCheck(root);
      expect(result.ok).toBe(false);
      expect(result.transient).toBe(true);
      expect(readFileSync(log, "utf8").trim()).toBe("2");
      expect(result.detail).toMatch(/identical output/);
      expect(result.detail).toMatch(/genuine defect/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reads a timeout that fails differently on the retry as machine load", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-done-loaded-"));
    try {
      const { log } = fakeCheckCli(
        root,
        `
        console.error(n === 1 ? "timed out waiting for deletion" : "timed out waiting for mount");
        process.exit(1);
      `,
      );
      const result = await runCloseOutCheck(root);
      expect(result.ok).toBe(false);
      expect(result.transient).toBe(true);
      expect(readFileSync(log, "utf8").trim()).toBe("2");
      expect(result.detail).toMatch(/different output/);
      expect(result.detail).toMatch(/too loaded/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes REPOOS_SKIP_BUILD through to the gate CLI (#0213)", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-done-skipbuild-"));
    try {
      // The close-out already ran `bun run build` (BUILD_STEPS) with nothing
      // changed since, so `completeTask` invokes the gate with
      // REPOOS_SKIP_BUILD=1 to skip `repoos check`'s own redundant "Full
      // build" step. This proves the env actually reaches the spawned gate
      // process — the exact wiring the skip depends on (and the mirror image
      // of the direct runDoneStep-level test above).
      const envOut = join(root, "env.out");
      const { log } = fakeCheckCli(
        root,
        `
        require("node:fs").writeFileSync(${JSON.stringify(envOut)}, process.env.REPOOS_SKIP_BUILD ?? "unset");
        process.exit(0);
      `,
      );
      const result = await runCloseOutCheck(root, { ...process.env, REPOOS_SKIP_BUILD: "1" });
      expect(result.ok).toBe(true);
      expect(readFileSync(envOut, "utf8")).toBe("1");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

type CheckSummaryLike = {
  ok: boolean;
  stage?: string;
  output?: string;
  detail?: string;
  transient?: boolean;
};

describe("diagnostic output hygiene", () => {
  it("redacts credential-shaped values", () => {
    const out = redactSecrets(
      "token=ghp_AbCdEf123456, pat=github_pat_XX_ab12, key=sk-abcdef123456, slack=xoxb-1234, aws=AKIAIOSFODNN7EXAMPLE, auth=Bearer eyJhbGciOi.eyJzdWI.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw",
    );
    expect(out).not.toMatch(/ghp_|github_pat_|sk-|xoxb-|AKIA|Bearer/);
    expect(out).toContain("***");
  });

  it("captures the tail, not the head, of combined output", () => {
    const head = Array.from({ length: 50 }, (_, i) => `noise ${i}`).join("\n");
    const out = captureOutput(head + "\n", "warning noise\nError: the real reason");
    expect(out.endsWith("Error: the real reason")).toBe(true);
    expect(out).not.toContain("noise 0");
    expect(out).toContain("noise 40");
  });

  it("strips ANSI escapes so diagnostics stay readable", () => {
    const out = captureOutput("\u001b[31merror\u001b[0m: boom", "");
    expect(out).toContain("error: boom");
    expect(out).not.toContain("\u001b[");
  });
});

describe("completeTask — resume and recovery", () => {
  it("completes the lifecycle in order on an already-merged retry", async () => {
    const fx = makeRepo();
    const { task, clean } = reviewTask(fx.root, "0130", "feat/rel");
    try {
      // Simulate the stranded close-out: the branch is already integrated.
      git(fx.root, ["merge", "--no-edit", "feat/rel"]);

      const progress: string[] = [];
      const result = await completeTask(config(fx.root), task, (step) => progress.push(step), {
        build: async () => ({ ok: true }),
        check: async () => ({ ok: true }),
      });

      // Screenshot regeneration is not part of the close-out at all: it is an
      // on-demand `repoos screenshots` run, never a merge-time step.
      expect(progress).toEqual(["merge", "build", "check", "done"]);
      expect(result.ok).toBe(true);
      expect(result.merged).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.task?.status).toBe("done");
      expect(result.task?.releasedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Cleanup ran: worktree gone, branch deleted, work preserved in main.
      expect(git(fx.root, ["branch", "--list", "feat/rel"])).toBe("");
      expect(git(fx.root, ["worktree", "list", "--porcelain"])).not.toContain("feat/rel");
    } finally {
      clean();
    }
  });

  it("preserves diagnostics and strands nothing when the check gate fails", async () => {
    const fx = makeRepo();
    const { task, clean } = reviewTask(fx.root, "0131", "feat/fail");
    try {
      git(fx.root, ["merge", "--no-edit", "feat/fail"]);

      const result = await completeTask(config(fx.root), task, undefined, {
        build: async () => ({ ok: true }),
        check: async () => ({
          ok: false,
          stage: "check",
          command: "node dist/cli/index.js check",
          exitCode: 1,
          output: "1 check(s) failed.\n✗ ui-smoke: WebKit could not mount the app",
          detail:
            "repoos check failed (exit 1) — node dist/cli/index.js check — 1 check(s) failed.",
        }),
      });

      expect(result.ok).toBe(false);
      expect(result.merged).toBe(true);
      expect(result.alreadyMerged).toBe(true);
      expect(result.reason).toMatch(/repoos check failed after merge/);
      // The diagnostics survive: stage, command, exit status, output tail.
      expect(result.check?.stage).toBe("check");
      expect(result.check?.command).toContain("check");
      expect(result.check?.exitCode).toBe(1);
      expect(result.check?.output).toContain("WebKit could not mount");
      // The task is NOT marked done and cleanup did NOT run before a green gate.
      expect(result.task).toBeUndefined();
      const onDisk = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: fx.root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(onDisk.status).toBe("review");
      expect(git(fx.root, ["branch", "--list", "feat/fail"])).toContain("feat/fail");
    } finally {
      clean();
    }
  });

  it("reports a real source conflict and keeps the task in review", async () => {
    const fx = makeRepo();
    const { task, clean } = reviewTask(fx.root, "0132", "feat/conflict");
    try {
      // Drift main so the branch merge conflicts on b.txt.
      commitFile(fx.root, "b.txt", "main edit\n", "main edit");

      const result = await completeTask(config(fx.root), task, undefined, {
        build: async () => ({ ok: true }),
        check: async () => ({ ok: true }),
      });

      expect(result.ok).toBe(false);
      expect(result.merged).toBe(false);
      expect(result.conflicts).toContain("b.txt");
      const onDisk = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: fx.root,
        defaultStatus: "inbox",
        defaultAssignee: "unassigned",
      });
      expect(onDisk.status).toBe("review");
    } finally {
      clean();
    }
  });
});
