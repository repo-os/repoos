// @ts-nocheck — test the plain-JS wrapper's selection engine directly.
import { writeCheckRun, readCheckRun } from "../../core/check-results-store.js";
import { describe, expect, it } from "vitest";
import {
  selectTestFiles,
  resolveTestSelection,
  DEFAULT_ALWAYS_RUN,
} from "../../../scripts/select-test-files.mjs";
import {
  DEFAULT_ALWAYS_RUN as PLAN_DEFAULTS,
  resolveCheckPlan,
  stepInProfile,
} from "../../core/check-plan.js";
import { planCloseOutGate } from "../../core/close-out-gate.js";
import {
  TestFileTimingCollector,
  testFileTimings,
  formatSlowestTestFiles,
} from "../../core/test-file-timings.js";
import { CheckStore } from "../../core/check-store.js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { runCheckPlan } from "../../commands/check.js";
import { loadConfig, getConfigSchema, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const all = [
  "/repo/tests/changed.test.ts",
  "/repo/tests/always.test.ts",
  "/repo/tests/unrelated.test.ts",
];
const options = {
  ref: "main",
  alwaysRun: ["**/always.test.ts"],
  git: (args) => (args[0] === "merge-base" ? "base-sha" : ""),
  list: (ref) => (ref ? [all[0]] : all),
};

describe("changed tests plus safety suites", () => {
  it("selects and runs the union once, skipping an unrelated suite", () => {
    const selection = selectTestFiles(options);
    const ran = [];
    const suites = Object.fromEntries(all.map((file) => [file, () => ran.push(file)]));
    selection.files.forEach((file) => suites[file]());
    expect(ran).toEqual([all[0], all[1]]);
    expect(ran).not.toContain(all[2]);
  });

  it.each(["merge-base", "diff", "list", "malformed list"])(
    "falls back to full on %s errors",
    (failure) => {
      const result = selectTestFiles({
        ...options,
        git: (args) => {
          if (args[0] === failure) throw new Error("git error");
          return options.git(args);
        },
        list: (ref) => {
          if (failure === "list") throw new Error("list failed");
          return failure === "malformed list" ? {} : options.list(ref);
        },
      });
      expect(result.files).toBeNull();
      expect(result.warning).toMatch(/full suite/);
    },
  );

  it("treats no merge base as a full-suite fallback", () => {
    expect(selectTestFiles({ ...options, git: () => "" }).files).toBeNull();
  });

  it("keeps the safety defaults aligned and allows a step override", () => {
    expect(DEFAULT_ALWAYS_RUN).toEqual(PLAN_DEFAULTS);
    const plan = resolveCheckPlan({
      check: { steps: [{ name: "tests", kind: "tests", alwaysRun: ["**/custom.test.ts"] }] },
    });
    expect(plan.steps[0].alwaysRun).toEqual(["**/custom.test.ts"]);
  });

  it("runs safety suites even when the default close-out could reuse the handoff", () => {
    expect(
      planCloseOutGate({ setting: "scoped", candidateBaseRef: "main-sha", treesIdentical: true }),
    ).toMatchObject({ scoped: true, reuseTests: false, changedRef: "main-sha" });
  });

  it("includes every step in the release profile", () => {
    expect(stepInProfile({ profiles: ["integration"] }, "release")).toBe(true);
  });
});

describe("test-file timing history", () => {
  it("keeps timing samples across remote chunks and log truncation", () => {
    const collector = new TestFileTimingCollector();
    collector.push("log line\n::repoos-test-fi");
    collector.push('le::{"file":"remote.ts","durationMs":3000}\n');
    collector.push("x".repeat(3 * 1024 * 1024) + "\n");
    expect(collector.values()).toEqual([{ file: "remote.ts", durationMs: 3000 }]);
  });
  it("persists durations and reports slowest first, ignoring malformed records", () => {
    const files = testFileTimings(
      '::repoos-test-file::{"file":"fast.ts","durationMs":20}\n::repoos-test-file::{"file":"slow.ts","durationMs":4000}\n::repoos-test-file::{bad\n',
    );
    const root = mkdtempSync(join(tmpdir(), "repoos-file-timings-"));
    try {
      const store = new CheckStore(root);
      store.record({
        phase: "cli",
        startedAt: new Date().toISOString(),
        outcome: "pass",
        testFileTimings: files,
      });
      const saved = store.list()[0].testFileTimings;
      expect(saved).toEqual(files);
      writeCheckRun(root, {
        profile: "default",
        source: "declared",
        startedAt: "now",
        finishedAt: "now",
        durationMs: 4000,
        passed: true,
        results: [
          {
            name: "tests",
            status: "passed",
            durationMs: 4000,
            required: true,
            testFileTimings: files,
          },
        ],
      });
      expect(readCheckRun(root)?.results[0].testFileTimings).toEqual(files);
      expect(formatSlowestTestFiles(saved, 1)).toBe("  4.00s  slow.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("real Vitest selection", () => {
  it("runs changed and safety files while skipping an unrelated file", () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "repoos-selection-e2e-")));
    const requireFromRepo = createRequire(join(process.cwd(), "package.json"));
    const vitestPackage = requireFromRepo.resolve("vitest/package.json");
    const vitestImport = join(vitestPackage, "..", "dist", "index.js");
    const vitest = join(vitestPackage, "..", "vitest.mjs");
    const config = join(root, "vitest.config.mjs");
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    try {
      writeFileSync(
        config,
        `export default { root: ${JSON.stringify(root)}, test: { environment: "node", include: ["*.test.ts"] } };`,
      );
      writeFileSync(join(root, "source.ts"), "export const value = 1;");
      for (const name of ["changed", "always", "unrelated"]) {
        writeFileSync(
          join(root, `${name}.test.ts`),
          `import { it, expect } from ${JSON.stringify(vitestImport)}; ${name === "changed" ? 'import { value } from "./source"; console.log(value);' : ""} it("${name}", () => expect(true).toBe(true));`,
        );
      }
      git("init", "-q", "-b", "main");
      git("add", ".");
      git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base");
      writeFileSync(join(root, "source.ts"), "export const value = 2;");
      const selection = resolveTestSelection(
        process.execPath,
        vitest,
        config,
        "main",
        ["**/always.test.ts"],
        root,
      );
      expect(selection.warning).toBeUndefined();
      expect(selection.files.map((f) => f.split("/").at(-1)).sort()).toEqual([
        "always.test.ts",
        "changed.test.ts",
      ]);
      const output = execFileSync(
        process.execPath,
        [vitest, "run", "--config", config, ...selection.files],
        { cwd: root, encoding: "utf8" },
      );
      expect(output).toContain("2 passed");
      expect(output).not.toContain("unrelated.test.ts");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("release removes changed filters from the executed tests step", async () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-release-tests-"));
    try {
      writeFileSync(
        join(root, "package.json"),
        JSON.stringify({ scripts: { test: "bun record.mjs" } }),
      );
      writeFileSync(join(root, "record.mjs"), "console.log(JSON.stringify(process.argv));");
      const plan = resolveCheckPlan({
        check: { steps: [{ name: "tests", kind: "tests", profiles: ["full"] }] },
      });
      const results = await runCheckPlan(plan, {
        repoRoot: root,
        profile: "release",
        changedRef: "bad-ref",
        changedPaths: [],
        echo: false,
      });
      expect(results[0].status).toBe("passed");
      expect(results[0].command).not.toContain("--changed");
      expect(results[0].output).not.toContain("bad-ref");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exposes the safety set in configuration and Settings", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-always-run-config-"));
    try {
      writeFileSync(
        join(root, "repoos.toml"),
        '[check]\nalwaysRun = ["**/safety.test.ts"]\n[[check.steps]]\nname = "tests"\nkind = "tests"\nalwaysRun = []\n',
      );
      const cfg = loadConfig(root);
      expect(cfg.check.alwaysRun).toEqual(["**/safety.test.ts"]);
      expect(cfg.check.steps[0].alwaysRun).toEqual([]);
      expect(getConfigSchema().find((field) => field.key === "check.alwaysRun").type).toBe("array");
      expect(SUPPORTED_TOML_KEYS).toContain("check.alwaysRun");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
