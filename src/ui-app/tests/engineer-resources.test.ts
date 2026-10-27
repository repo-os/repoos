import { afterEach, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepoOSConfig } from "../../core/types.js";
import {
  applyEngineerResourceEnv,
  engineerResourceEnv,
  installEngineerPathShims,
  isHeavyInvocation,
  withEngineerWorkerArgs,
} from "../../core/engineer-resources.js";
import { heavyJobCounts, localCheckLockRoot } from "../../core/cross-process-slots.js";
import { heavySlotLimit, vitestMaxWorkers } from "../../core/resource-limits.js";

function config(overrides: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root: "/tmp/repo",
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
    ...overrides,
  };
}

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("engineer resource env (#0961)", () => {
  it("defaults vitest and playwright workers to 2", () => {
    const env = engineerResourceEnv(config());
    expect(env.VITEST_MAX_WORKERS).toBe("2");
    expect(env.VITEST_MAX_THREADS).toBe("2");
    expect(env.REPOOS_TEST_WORKERS).toBe("2");
    expect(env.PLAYWRIGHT_WORKERS).toBe("2");
    expect(env.PLAYWRIGHT_MAX_WORKERS).toBe("2");
    expect(vitestMaxWorkers(config())).toBe(2);
    expect(heavySlotLimit(config())).toBe(2);
  });

  it("writes the configured caps into the spawn environment", () => {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/bin" };
    applyEngineerResourceEnv(
      env,
      config({ heavySlots: 2, vitest: { maxWorkers: 3 }, playwright: { workers: 1 } }),
    );
    expect(env.VITEST_MAX_WORKERS).toBe("3");
    expect(env.REPOOS_TEST_WORKERS).toBe("3");
    expect(env.PLAYWRIGHT_WORKERS).toBe("1");
    expect(env.PATH).toBe("/usr/bin");
  });

  it("classifies heavy engineer commands", () => {
    const cases: Array<[string, string[], boolean]> = [
      ["bun", ["run", "build"], true],
      ["bun", ["run", "--bun", "build:ui"], true],
      ["bun", ["run", "test"], true],
      ["bun", ["test"], true],
      ["bun", ["run", "fmt"], false],
      ["bun", ["run", "testimony"], false],
      ["bunx", ["vitest", "run"], true],
      ["bunx", ["playwright", "test"], true],
      ["bunx", ["oxlint"], false],
      ["bun", ["x", "tsc"], true],
      ["tsc", ["-p", "tsconfig.json"], true],
      ["vitest", ["run"], true],
      ["vue-tsc", ["--noEmit"], true],
      ["vite", ["build"], true],
      ["vite", ["dev"], false],
      ["playwright", ["test"], true],
    ];
    for (const [tool, args, heavy] of cases) {
      expect(isHeavyInvocation(tool, args), `${tool} ${args.join(" ")}`).toBe(heavy);
    }
  });

  it("caps Playwright workers in argv, including bunx invocations", () => {
    const cfg = config({ playwright: { workers: 2 } });
    expect(withEngineerWorkerArgs("playwright", ["test"], cfg)).toEqual(["test", "--workers=2"]);
    expect(withEngineerWorkerArgs("playwright", ["test", "--workers=8"], cfg)).toEqual([
      "test",
      "--workers=2",
    ]);
    expect(withEngineerWorkerArgs("playwright", ["test", "--workers", "1"], cfg)).toEqual([
      "test",
      "--workers=1",
    ]);
    const wrapped: Array<[string, string[], string[]]> = [
      ["bunx", ["playwright", "test"], ["playwright", "test", "--workers=2"]],
      ["bunx", ["--bun", "playwright", "test"], ["--bun", "playwright", "test", "--workers=2"]],
      ["bun", ["x", "playwright", "test"], ["x", "playwright", "test", "--workers=2"]],
      [
        "bun",
        ["--bun", "exec", "--bun", "playwright", "test"],
        ["--bun", "exec", "--bun", "playwright", "test", "--workers=2"],
      ],
    ];
    for (const [tool, args, expected] of wrapped) {
      expect(withEngineerWorkerArgs(tool, args, cfg)).toEqual(expected);
    }
    expect(withEngineerWorkerArgs("playwright", ["show-report"], cfg)).toEqual(["show-report"]);
  });

  it("runs five fake engineers at heavySlots concurrency and queues the rest", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "repoos-engineer-heavy-"));
    dirs.push(root);
    const realBin = join(root, "real-bin");
    mkdirSync(realBin, { recursive: true });
    const runLog = join(root, "runs.log");
    writeFileSync(
      join(realBin, "vitest"),
      `#!/bin/sh
printf 'start %s\\n' "$$" >> "$REPOOS_TEST_RUN_LOG"
sleep 0.2
printf 'end %s\\n' "$$" >> "$REPOOS_TEST_RUN_LOG"
`,
    );
    chmodSync(join(realBin, "vitest"), 0o755);
    writeFileSync(join(root, "repoos.toml"), "heavySlots = 2\n[pressureGuard]\nenabled = false\n");

    const shimDir = installEngineerPathShims(
      root,
      ".repoos",
      `${realBin}:${process.env.PATH ?? ""}`,
    );
    expect(shimDir).toBe(join(root, ".repoos", "bin"));
    const shim = readFileSync(join(shimDir!, "vitest"), "utf8");
    expect(shim).toContain("heavy-wrap.");
    expect(shim).not.toContain(join(root, "src", "core"));

    const children: ChildProcess[] = [];
    const completions: Promise<number>[] = [];
    let settled = 0;
    try {
      for (let i = 0; i < 5; i++) {
        const child = spawn(join(shimDir!, "vitest"), ["run"], {
          cwd: root,
          env: { ...process.env, REPOOS_TEST_RUN_LOG: runLog },
          stdio: "ignore",
        });
        children.push(child);
        completions.push(
          new Promise((resolve) => {
            let done = false;
            const finish = (code: number) => {
              if (done) return;
              done = true;
              settled++;
              resolve(code);
            };
            child.once("error", () => finish(127));
            child.once("exit", (code) => finish(code ?? 1));
          }),
        );
      }

      let peak = 0;
      let sawQueue = false;
      const deadline = Date.now() + 15_000;
      while (settled < 5 && Date.now() < deadline) {
        if (existsSync(runLog)) {
          let running = 0;
          for (const line of readFileSync(runLog, "utf8").split("\n")) {
            if (line.startsWith("start ")) running++;
            if (line.startsWith("end ")) running = Math.max(0, running - 1);
            peak = Math.max(peak, running);
          }
        }
        const counts = heavyJobCounts(localCheckLockRoot(root, ".repoos"));
        sawQueue ||= counts.queued > 0;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      if (settled < 5) throw new Error(`only ${settled}/5 fake heavy jobs exited`);
      const codes = await Promise.all(completions);
      expect(codes).toEqual([0, 0, 0, 0, 0]);
      expect(peak).toBe(2);
      expect(sawQueue).toBe(true);
      expect(readFileSync(runLog, "utf8").match(/^start /gm)).toHaveLength(5);
      expect(heavyJobCounts(localCheckLockRoot(root, ".repoos"))).toEqual({
        running: 0,
        queued: 0,
      });
    } finally {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }
      await Promise.allSettled(completions);
    }
  }, 20_000);
});
