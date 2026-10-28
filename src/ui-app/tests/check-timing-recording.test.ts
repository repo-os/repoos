import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { CheckStore } from "../../core/check-store.js";
import { stepTimingsFromOutput } from "../../core/check-timings.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

describe("check timing recording (#0970)", () => {
  it.each([0, 7])("persists every step and prints a summary when a step exits %i", (exit) => {
    const cwd = mkdtempSync(join(tmpdir(), "repoos-step-record-"));
    dirs.push(cwd);
    writeFileSync(
      join(cwd, "repoos.toml"),
      `
[pressureGuard]
enabled = false
[check]
version = 1
[[check.steps]]
name = "sample"
command = "exit ${exit}"
[[check.steps]]
name = "deferred"
command = "true"
profiles = ["full"]
`,
    );
    const res = spawnSync(
      process.execPath,
      [join(root, "src/cli/index.ts"), "check", "--local-tests"],
      {
        cwd,
        env: { ...process.env, REPOOS_ROOT: cwd, REPOOS_STALENESS_REEXEC: "1" },
        encoding: "utf8",
        timeout: 30000,
      },
    );
    expect(res.status, res.stdout + res.stderr).toBe(exit ? 1 : 0);
    expect(res.stdout).toContain("Step timings");
    const steps = stepTimingsFromOutput(res.stdout);
    expect(steps).toEqual([
      { name: "sample", status: exit ? "failed" : "passed", durationMs: expect.any(Number) },
      { name: "deferred", status: "skipped", durationMs: 0 },
    ]);
    expect(new CheckStore(cwd).list()[0]?.steps).toEqual(steps);
  });

  it.each([0, 9])("the remote wrapper preserves exit %i and emits a measured outcome", (exit) => {
    const res = spawnSync(
      process.execPath,
      [
        join(root, "scripts/remote-runner/time-step.mjs"),
        "tests",
        process.execPath,
        "-e",
        `console.log("child output"); process.exit(${exit})`,
      ],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(exit);
    expect(res.stdout).toContain("child output");
    expect(stepTimingsFromOutput(res.stdout)).toEqual([
      { name: "tests", status: exit ? "failed" : "passed", durationMs: expect.any(Number) },
    ]);
  });
});
