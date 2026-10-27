import { afterEach, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";
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

  it("caps Vitest workers in argv for direct and Bun package invocations", () => {
    const cfg = config({ vitest: { maxWorkers: 2 } });
    const cases: Array<[string, string[], string[]]> = [
      ["vitest", ["run"], ["run", "--maxWorkers=2"]],
      ["vitest", ["run", "--maxWorkers=8"], ["run", "--maxWorkers=2"]],
      ["vitest", ["run", "--maxWorkers", "1"], ["run", "--maxWorkers=1"]],
      ["bunx", ["vitest", "run"], ["vitest", "run", "--maxWorkers=2"]],
      ["bun", ["--bun", "x", "vitest", "run"], ["--bun", "x", "vitest", "run", "--maxWorkers=2"]],
      ["vitest", ["--version"], ["--version"]],
    ];
    for (const [tool, args, expected] of cases) {
      expect(withEngineerWorkerArgs(tool, args, cfg)).toEqual(expected);
    }
  });

  it("limits resolved Vitest workers for direct, Bun and package-script runs", async () => {
    if (process.platform === "win32") return;
    const root = mkdtempSync(join(tmpdir(), "repoos-vitest-worker-cap-"));
    dirs.push(root);
    const realBin = join(root, "real-bin");
    mkdirSync(realBin, { recursive: true });
    const realBun = process.versions.bun
      ? process.execPath
      : execFileSync("which", ["bun"], { encoding: "utf8" }).trim();
    const realVitest = join(process.cwd(), "node_modules/vitest/vitest.mjs");
    const resolvedFile = join(root, "resolved-workers.txt");
    const vitestConfig = join(root, "vitest.config.cjs");
    writeFileSync(
      vitestConfig,
      `module.exports = {
  test: {
    globals: true,
    maxWorkers: 8,
    include: ["fixture.test.js"],
    reporters: [${JSON.stringify(join(root, "reporter.mjs"))}],
  },
};
`,
    );
    writeFileSync(
      join(root, "reporter.mjs"),
      `import { writeFileSync } from "node:fs";
export default class {
  onInit(ctx) {
    writeFileSync(process.env.REPOOS_TEST_RESOLVED_WORKERS, String(ctx.config.maxWorkers));
  }
}
`,
    );
    writeFileSync(join(root, "fixture.test.js"), `test("passes", () => {});\n`);
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        type: "module",
        scripts: { test: "vitest run --config vitest.config.cjs" },
      }),
    );
    writeFileSync(
      join(root, "repoos.toml"),
      "heavySlots = 1\nvitest.maxWorkers = 2\n[pressureGuard]\nenabled = false\n",
    );
    const executables: Record<string, string> = {
      bun: `exec "$REPOOS_TEST_REAL_BUN" "$@"`,
      bunx: `exec "$REPOOS_TEST_REAL_BUN" x "$@"`,
      vitest: `exec "$REPOOS_TEST_REAL_BUN" "$REPOOS_TEST_VITEST_BIN" "$@"`,
    };
    for (const [name, body] of Object.entries(executables)) {
      writeFileSync(join(realBin, name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(realBin, name), 0o755);
    }
    const shimDir = installEngineerPathShims(
      root,
      ".repoos",
      `${realBin}:${process.env.PATH ?? ""}`,
    )!;
    const env = {
      ...process.env,
      PATH: `${shimDir}:${realBin}:${process.env.PATH ?? ""}`,
      REPOOS_TEST_REAL_BUN: realBun,
      REPOOS_TEST_VITEST_BIN: realVitest,
      REPOOS_TEST_RESOLVED_WORKERS: resolvedFile,
    };

    async function resolvedWorkers(
      command: string,
      args: string[],
      runEnv: NodeJS.ProcessEnv,
    ): Promise<{ code: number; workers: string; output: string }> {
      rmSync(resolvedFile, { force: true });
      const child = spawn(command, args, {
        cwd: root,
        env: runEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let output = "";
      child.stdout?.on("data", (chunk) => (output += String(chunk)));
      child.stderr?.on("data", (chunk) => (output += String(chunk)));
      const code = await new Promise<number>((resolve) => {
        let done = false;
        const finish = (value: number) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(value);
        };
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          finish(124);
        }, 15_000);
        child.once("error", () => finish(127));
        child.once("exit", (exit) => finish(exit ?? 1));
      });
      return {
        code,
        workers: existsSync(resolvedFile) ? readFileSync(resolvedFile, "utf8") : "missing",
        output,
      };
    }

    const realEnv: NodeJS.ProcessEnv = { ...env, PATH: `${realBin}:${process.env.PATH ?? ""}` };
    for (const key of [
      "VITEST_MAX_WORKERS",
      "VITEST_MAX_THREADS",
      "REPOOS_TEST_WORKERS",
      "REPOOS_HEAVY_SLOT_HELD",
      "REPOOS_LOCAL_CHECK_SLOT_HELD",
    ]) {
      delete realEnv[key];
    }
    const baseline = await resolvedWorkers(
      realBun,
      [realVitest, "run", "--config", vitestConfig],
      realEnv,
    );
    expect(baseline, baseline.output).toMatchObject({ code: 0, workers: "8" });

    const cases: Array<[string, string, string[], NodeJS.ProcessEnv]> = [
      ["direct", join(shimDir, "vitest"), ["run", "--config", vitestConfig], env],
      ["bunx", join(shimDir, "bunx"), ["vitest", "run", "--config", vitestConfig], env],
      ["bun run test", join(shimDir, "bun"), ["run", "test"], env],
      [
        "Vitest native env",
        realBun,
        [realVitest, "run", "--config", vitestConfig],
        { ...realEnv, VITEST_MAX_WORKERS: "2" },
      ],
    ];
    for (const [label, command, args, runEnv] of cases) {
      const result = await resolvedWorkers(command, args, runEnv);
      expect(result, `${label}: ${result.output}`).toMatchObject({ code: 0, workers: "2" });
    }
  }, 30_000);

  it("shares heavySlots across five engineers from two checkouts", async () => {
    if (process.platform === "win32") return;
    const rootA = mkdtempSync(join(tmpdir(), "repoos-engineer-heavy-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "repoos-engineer-heavy-b-"));
    dirs.push(rootA, rootB);
    const realBin = join(rootA, "real-bin");
    mkdirSync(realBin, { recursive: true });
    const runLog = join(rootA, "runs.log");
    writeFileSync(
      join(realBin, "vitest"),
      `#!/bin/sh
printf 'start %s\\n' "$$" >> "$REPOOS_TEST_RUN_LOG"
sleep 0.2
printf 'end %s\\n' "$$" >> "$REPOOS_TEST_RUN_LOG"
`,
    );
    chmodSync(join(realBin, "vitest"), 0o755);
    for (const root of [rootA, rootB]) {
      writeFileSync(
        join(root, "repoos.toml"),
        "heavySlots = 2\n[pressureGuard]\nenabled = false\n",
      );
    }

    const shimA = installEngineerPathShims(
      rootA,
      ".repoos",
      `${realBin}:${process.env.PATH ?? ""}`,
    );
    const shimB = installEngineerPathShims(
      rootB,
      ".repoos",
      `${realBin}:${process.env.PATH ?? ""}`,
    );
    expect(shimA).toBe(join(rootA, ".repoos", "bin"));
    expect(shimB).toBe(join(rootB, ".repoos", "bin"));
    const shim = readFileSync(join(shimA!, "vitest"), "utf8");
    expect(shim).toContain("heavy-wrap.");
    expect(shim).not.toContain(join(rootA, "src", "core"));
    const sharedLockRoot = localCheckLockRoot(rootA, ".repoos");
    expect(localCheckLockRoot(rootB, ".repoos")).toBe(sharedLockRoot);
    expect(sharedLockRoot.startsWith(rootA)).toBe(false);
    expect(sharedLockRoot.startsWith(rootB)).toBe(false);

    const children: ChildProcess[] = [];
    const completions: Promise<number>[] = [];
    let settled = 0;
    try {
      const engineers = [
        { shim: shimA!, cwd: rootA },
        { shim: shimA!, cwd: rootA },
        { shim: shimA!, cwd: rootA },
        { shim: shimB!, cwd: rootB },
        { shim: shimB!, cwd: rootB },
      ];
      for (const engineer of engineers) {
        const child = spawn(join(engineer.shim, "vitest"), ["run"], {
          cwd: engineer.cwd,
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
        const counts = heavyJobCounts(sharedLockRoot);
        sawQueue ||= counts.queued > 0;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }

      if (settled < 5) throw new Error(`only ${settled}/5 fake heavy jobs exited`);
      const codes = await Promise.all(completions);
      expect(codes).toEqual([0, 0, 0, 0, 0]);
      expect(peak).toBe(2);
      expect(sawQueue).toBe(true);
      expect(readFileSync(runLog, "utf8").match(/^start /gm)).toHaveLength(5);
      expect(heavyJobCounts(sharedLockRoot)).toEqual({
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
