import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig, Task } from "../../core/types";
import { parseTask } from "../../core/task";
import { handoffTask } from "../../server/handoff";
import { TaskCheckManager } from "../../server/task-check";
import type { RemoteValidator } from "../../server/remote-validation";

interface Fixture {
  root: string;
  worktree: string;
  bin: string;
  taskPath: string;
  config: RepoOSConfig;
  clean: () => void;
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function taskText(status: string): string {
  return `---
id: "0001"
title: Handoff fixture
type: feature
status: ${status}
priority: p2
area: agent
assigned_to: ai
branch: feat/handoff
---
Body
`;
}

function makeFixture(checkExit = 0): Fixture {
  const root = mkdtempSync(join(tmpdir(), "repoos-handoff-"));
  const worktree = `${root}-wt`;
  const bin = join(root, "fake-bin");
  const taskPath = join(root, "work", "0001-handoff.md");
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(bin, { recursive: true });
  writeFileSync(taskPath, taskText("active"));
  writeFileSync(join(root, "source.txt"), "base\n");
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "app.js"), "built from main\n");
  writeFileSync(join(bin, "repoos"), `#!/bin/sh\nexit ${checkExit}\n`, { mode: 0o755 });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-qm", "initial"]);
  git(root, ["branch", "feat/handoff"]);
  git(root, ["worktree", "add", "-q", worktree, "feat/handoff"]);
  writeFileSync(join(worktree, "source.txt"), "implemented\n");
  return {
    root,
    worktree,
    bin,
    taskPath,
    config: {
      root,
      workDir: "work",
      docsDir: "docs",
      skillsDir: "skills",
      taskExtensions: [".md"],
      defaultStatus: "inbox",
      defaultAssignee: "unassigned",
      cacheDir: ".repoos",
    },
    clean: () => {
      rmSync(root, { recursive: true, force: true });
      rmSync(worktree, { recursive: true, force: true });
    },
  };
}

function installLocalCheck(fx: Fixture, checkExit: number): void {
  const cli = join(fx.worktree, "dist", "cli", "index.js");
  mkdirSync(join(fx.worktree, "dist", "cli"), { recursive: true });
  writeFileSync(cli, `process.exit(${checkExit});\n`);
}

function readTask(fx: Fixture): Task {
  return parseTask({
    content: readFileSync(fx.taskPath, "utf8"),
    absPath: fx.taskPath,
    root: fx.root,
    defaultStatus: fx.config.defaultStatus,
    defaultAssignee: fx.config.defaultAssignee,
  });
}

function request(fx: Fixture, overrides: Record<string, string> = {}) {
  return {
    taskId: "0001",
    runId: "runner-issued-capability",
    branch: "feat/handoff",
    workdir: fx.worktree,
    ...overrides,
  };
}

describe("trusted server-side handoff", () => {
  it("commits, checks, moves both task copies to review, and is idempotent", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const steps: string[] = [];
      const first = await handoffTask(fx.config, readTask(fx), request(fx), (step) =>
        steps.push(step),
      );
      expect(first).toMatchObject({ ok: true, step: "done" });
      // #0512: the commit gate runs BEFORE the check, so the tree the check
      // tested is the tree that got committed — the whole point of the order.
      expect(steps).toEqual(["validate", "commit", "check", "review", "main", "done"]);
      expect(readTask(fx).status).toBe("review");
      expect(readFileSync(join(fx.worktree, "work", "0001-handoff.md"), "utf8")).toContain(
        "status: review",
      );
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");
      const count = Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]));

      const repeated = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(repeated).toMatchObject({ ok: true, detail: "handoff was already finalized" });
      expect(Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]))).toBe(count);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("keeps locally rebuilt dist out of feature commits and merge conflicts", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const base = git(fx.worktree, ["rev-parse", "HEAD"]);
      writeFileSync(join(fx.worktree, "dist", "app.js"), "built in feature worktree\n");
      git(fx.worktree, ["add", "dist"]); // Even pre-staged artifacts are excluded.

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
      const committed = git(fx.worktree, ["diff", "--name-only", `${base}..HEAD`]).split("\n");
      expect(committed).toContain("source.txt");
      expect(committed.some((path) => path.startsWith("dist/"))).toBe(false);
      expect(git(fx.worktree, ["status", "--porcelain", "--", "dist"])).toContain("dist/app.js");

      // Main can regenerate the same tracked artifact without creating an
      // artifact conflict when the feature branch is merged.
      writeFileSync(join(fx.root, "dist", "app.js"), "rebuilt on main\n");
      git(fx.root, ["add", "dist"]);
      git(fx.root, ["commit", "-m", "chore: regenerate dist on main"]);
      try {
        git(fx.root, ["merge", "--no-commit", "--no-ff", "feat/handoff"]);
      } catch {
        // The task file is intentionally edited on both sides and may need the
        // done flow's existing auto-resolution. Generated dist output must not.
      }
      const conflicts = git(fx.root, ["diff", "--name-only", "--diff-filter=U"])
        .split("\n")
        .filter(Boolean);
      expect(conflicts.some((path) => path.startsWith("dist/"))).toBe(false);
      git(fx.root, ["merge", "--abort"]);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("refuses review when repoos check fails", async () => {
    const fx = makeFixture(1);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const base = git(fx.worktree, ["rev-parse", "HEAD"]);
      const result = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(result).toMatchObject({ ok: false, step: "check" });
      expect(readTask(fx).status).toBe("active");
      // #0512: the implementation is committed BEFORE the check runs, so a
      // failing gate no longer leaves the worktree holding the only copy of
      // the work — the task can be retried, and a crash between here and the
      // retry cannot lose it.
      expect(git(fx.worktree, ["diff", "--name-only", `${base}..HEAD`]).split("\n")).toContain(
        "source.txt",
      );
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("uses the assigned worktree's CLI instead of an unrelated global repoos", async () => {
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      installLocalCheck(fx, 0);
      writeFileSync(join(fx.bin, "repoos"), "#!/bin/sh\nexit 23\n", { mode: 0o755 });
      const result = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(result).toMatchObject({ ok: true, step: "done" });
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("finalizes the handoff when repoos check is skipped because no check plan is configured (#0592)", async () => {
    // A planless repo's gate exits 0 with the "no check plan" notice; the
    // handoff must treat that as a pass — the explicitly blocking failure
    // (exit 1) is the test two doors up.
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const notice = "No check plan configured — nothing to verify.";
      writeFileSync(join(fx.bin, "repoos"), `#!/bin/sh\nprintf '  ⚠ ${notice}\\n'\nexit 0\n`, {
        mode: 0o755,
      });
      const result = await handoffTask(fx.config, readTask(fx), request(fx));
      expect(result).toMatchObject({ ok: true, step: "done" });
      expect(readTask(fx).status).toBe("review");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("leaves the engineer's uncommitted edit byte-for-byte intact and commits it (#0512)", async () => {
    // The check runs in the worktree AFTER the implement commit, on the tree it
    // just committed. A green result must therefore describe exactly the bytes
    // that end up on the branch — not a version of them that only ever existed
    // in the working tree. #0506 is the incident: a source file was rewritten
    // during the checks and the handoff commit captured a stale copy of it.
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      const base = git(fx.worktree, ["rev-parse", "HEAD"]);

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
      // The edit is untouched on disk...
      expect(readFileSync(join(fx.worktree, "source.txt"), "utf8")).toBe("implemented\n");
      // ...and it is in the commit, not stranded in the working tree.
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");
      expect(git(fx.worktree, ["show", "HEAD:source.txt"])).toBe("implemented");
      expect(git(fx.worktree, ["diff", "--name-only", `${base}..HEAD`]).split("\n")).toContain(
        "source.txt",
      );
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("fails loudly when the worktree changes during the check (#0512)", async () => {
    // Deterministic stand-in for the #0506 writer: a check that rewrites a
    // source file. A green result then describes a tree that no longer exists,
    // so the handoff must refuse instead of moving the task to review.
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(
        join(fx.bin, "repoos"),
        "#!/bin/sh\nprintf 'rewritten\\n' > source.txt\nexit 0\n",
        {
          mode: 0o755,
        },
      );

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "check" });
      expect(result.detail).toMatch(/changed while the gate was running/);
      expect(result.detail).toContain("source.txt");
      expect(readTask(fx).status).toBe("active");
      // The rewrite is still on disk — the guard refuses, it never reverts.
      expect(readFileSync(join(fx.worktree, "source.txt"), "utf8")).toBe("rewritten\n");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("fails loudly when a commit lands during the check (#0512)", async () => {
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(
        join(fx.bin, "repoos"),
        "#!/bin/sh\nprintf 'late\\n' > late.txt\ngit add late.txt\ngit commit -qm 'late commit'\nexit 0\n",
        { mode: 0o755 },
      );

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "check" });
      expect(result.detail).toMatch(/HEAD moved from/);
      expect(readTask(fx).status).toBe("active");
      // Whatever landed is still there, committed on the branch.
      expect(git(fx.worktree, ["show", "HEAD:late.txt"])).toBe("late");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("tolerates a check that only writes generated output", async () => {
    // `repoos check` builds in the worktree, so `dist/` and the runtime cache
    // are expected to move. Only real work files count as drift, or every
    // handoff would trip its own gate.
    const fx = makeFixture(0);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(
        join(fx.bin, "repoos"),
        "#!/bin/sh\nprintf 'rebuilt\\n' > dist/app.js\nmkdir -p .repoos\nprintf 'x\\n' > .repoos/log\nexit 0\n",
        { mode: 0o755 },
      );

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects a vacuous handoff with no source changes (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      // The fixture's one working change is reverted: the only thing modified
      // in the worktree is a locally regenerated dist artifact. Nothing to
      // implement — the handoff must not be blessed.
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      writeFileSync(join(fx.worktree, "dist", "app.js"), "rebuilt by repoos check\n");

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "commit" });
      expect(result.detail).toMatch(/no implementation found/);
      expect(result.detail).toContain("since");
      // Task stays active; nothing committed, nothing moved to review.
      expect(readTask(fx).status).toBe("active");
      expect(Number(git(fx.worktree, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("does not count dist-only or task-file changes as implementation (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      // Both pre-staged and just-dirty generated artifacts stay excluded.
      writeFileSync(join(fx.worktree, "dist", "app.js"), "built in feature worktree\n");
      git(fx.worktree, ["add", "dist"]);
      // Task-file churn alone is not implementation either.
      writeFileSync(
        join(fx.worktree, "work", "0001-handoff.md"),
        taskText("active").replace("priority: p2", "priority: p3"),
      );

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: false, step: "commit" });
      expect(result.detail).toMatch(/no implementation found/);
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("honors the no_source_change escape hatch for a legitimate no-op task (#0170)", async () => {
    const fx = makeFixture();
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      writeFileSync(join(fx.worktree, "source.txt"), "base\n");
      const taskWithFlag = taskText("active").replace(
        "branch: feat/handoff",
        "branch: feat/handoff\nno_source_change: true",
      );
      writeFileSync(fx.taskPath, taskWithFlag);
      writeFileSync(join(fx.worktree, "work", "0001-handoff.md"), taskWithFlag);

      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({ ok: true, step: "done" });
      expect(readTask(fx).status).toBe("review");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  it("rejects an invalid session capability before changing Git or files", async () => {
    const fx = makeFixture();
    const oldHead = git(fx.worktree, ["rev-parse", "HEAD"]);
    try {
      const result = await handoffTask(fx.config, readTask(fx), request(fx, { runId: "" }));
      expect(result).toMatchObject({ ok: false, step: "validate" });
      expect(git(fx.worktree, ["rev-parse", "HEAD"])).toBe(oldHead);
      expect(readTask(fx).status).toBe("active");
    } finally {
      fx.clean();
    }
  });

  it("rejects a mismatched worktree or branch before changing Git", async () => {
    const fx = makeFixture();
    const oldHead = git(fx.worktree, ["rev-parse", "HEAD"]);
    try {
      const result = await handoffTask(
        fx.config,
        readTask(fx),
        request(fx, { branch: "feat/other" }),
      );
      expect(result).toMatchObject({ ok: false, step: "validate" });
      expect(git(fx.worktree, ["rev-parse", "HEAD"])).toBe(oldHead);
    } finally {
      fx.clean();
    }
  });

  it("records the check failure in transcript and leaves task active for retry", async () => {
    const fx = makeFixture(1);
    const oldPath = process.env.PATH ?? "";
    process.env.PATH = `${fx.bin}:${oldPath}`;
    try {
      // With a failing repoos check, the handoff should fail at the check step
      // and leave the task in active status (not moved to review)
      const result = await handoffTask(fx.config, readTask(fx), request(fx));

      expect(result).toMatchObject({
        ok: false,
        step: "check",
        detail: expect.stringContaining("repoos check failed"),
      });
      expect(readTask(fx).status).toBe("active");
      // #0512: committed before the gate, so the failing run leaves the work
      // on the branch rather than sitting uncommitted in the worktree.
      expect(git(fx.worktree, ["status", "--porcelain"])).toBe("");
      expect(git(fx.worktree, ["log", "-1", "--format=%s"])).toContain("implement");
    } finally {
      process.env.PATH = oldPath;
      fx.clean();
    }
  });

  describe("remote pre-review gate (#0520)", () => {
    function remoteFixture(): Fixture {
      const fx = makeFixture();
      fx.config.remoteValidation = { enabled: true };
      return fx;
    }
    function fakeRemote(result: { ok: boolean; transient?: boolean; detail?: string }): {
      validator: RemoteValidator;
      shas: string[];
    } {
      const shas: string[] = [];
      const validator = {
        validate: async (opts: { candidateSha: string; onChunk?: (c: string) => void }) => {
          shas.push(opts.candidateSha);
          opts.onChunk?.("remote gate output\n");
          return { ok: result.ok, transient: result.transient ?? false, detail: result.detail };
        },
        dispose: async () => {},
        reconcile: async () => {},
        logPath: () => "",
      } as unknown as RemoteValidator;
      return { validator, shas };
    }

    it("sends the runner the COMMITTED tree, including edits that were uncommitted at handoff", async () => {
      const fx = remoteFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      try {
        const { validator, shas } = fakeRemote({ ok: true });
        const result = await handoffTask(
          fx.config,
          readTask(fx),
          request(fx),
          undefined,
          undefined,
          undefined,
          undefined,
          validator,
        );
        expect(result).toMatchObject({ ok: true, step: "done" });
        expect(shas).toHaveLength(1);
        // The edit was only on disk when the handoff began (makeFixture). Because
        // the commit gate runs first, the sha the runner tested contains it.
        expect(git(fx.worktree, ["show", `${shas[0]}:source.txt`])).toBe("implemented");
      } finally {
        process.env.PATH = oldPath;
        fx.clean();
      }
    });

    it("keeps the task active and records the failure for the Debug tab when the remote gate is red", async () => {
      const fx = remoteFixture();
      const oldPath = process.env.PATH ?? "";
      process.env.PATH = `${fx.bin}:${oldPath}`;
      try {
        const { validator } = fakeRemote({ ok: false, transient: false, detail: "suite failed" });
        const taskChecks = new TaskCheckManager();
        const result = await handoffTask(
          fx.config,
          readTask(fx),
          request(fx),
          undefined,
          undefined,
          taskChecks,
          () => {},
          validator,
        );
        expect(result).toMatchObject({ ok: false, step: "check" });
        expect(String(result.detail)).toContain("remote validation failed");
        expect(readTask(fx).status).toBe("active");
        const runs = taskChecks.getRuns("0001");
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({ running: false, passed: false });
        expect(runs[0]!.output).toContain("remote gate output");
      } finally {
        process.env.PATH = oldPath;
        fx.clean();
      }
    });
  });
});
