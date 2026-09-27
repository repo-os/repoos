import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { buildSourceHash } from "../../core/build.js";
import { resolveBun } from "../../core/runtime.js";

const bun = resolveBun();
const runtimeSrc = resolve("src/core/runtime.ts");
const buildSrc = resolve("src/core/build.ts");
const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures) rmSync(fixture, { recursive: true, force: true });
  fixtures.length = 0;
});

function fixture(initiallyStale: boolean): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-stale-reexec-"));
  fixtures.push(root);
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "src", "index.ts"), "export const value = 1;\n");
  writeFileSync(
    join(root, "dist", ".build-info.json"),
    JSON.stringify({ hash: initiallyStale ? "old" : buildSourceHash(root) }),
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { build: "bun build.mjs" } }),
  );
  writeFileSync(
    join(root, "build.mjs"),
    `import { appendFileSync, writeFileSync } from "node:fs";\n` +
      `import { join } from "node:path";\n` +
      `import { buildSourceHash } from ${JSON.stringify(buildSrc)};\n` +
      `appendFileSync(join(process.cwd(), "builds"), "build\\n");\n` +
      `if (process.env.TEST_BUILD_FAIL === "1") process.exit(4);\n` +
      `if (process.env.TEST_BUILD_NOOP !== "1") writeFileSync(join(process.cwd(), "dist", ".build-info.json"), JSON.stringify({hash: buildSourceHash(process.cwd())}));\n`,
  );
  writeFileSync(
    join(root, "cli.ts"),
    `import { appendFileSync } from "node:fs";\n` +
      `import { join } from "node:path";\n` +
      `import { reexecAfterStaleBuild } from ${JSON.stringify(runtimeSrc)};\n` +
      `import { checkBuildForRoot } from ${JSON.stringify(buildSrc)};\n` +
      `const root = ${JSON.stringify(root)};\n` +
      `appendFileSync(join(root, "starts"), "start\\n");\n` +
      `if (!reexecAfterStaleBuild(root)) {\n` +
      `  const stale = checkBuildForRoot(root).stale;\n` +
      `  process.stdout.write(JSON.stringify({argv: process.argv.slice(2), stale, guard: process.env.REPOOS_STALENESS_REEXEC ?? null}));\n` +
      `  process.exit(stale ? 9 : 7);\n` +
      `}\n`,
  );
  return root;
}

function run(root: string, env: Record<string, string> = {}) {
  const result = spawnSync(bun!, [join(root, "cli.ts"), "check", "--changed", "main"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, REPOOS_STALENESS_REEXEC: "", ...env },
  });
  return {
    ...result,
    output: JSON.parse(result.stdout) as { argv: string[]; stale: boolean; guard: string | null },
    starts: readFileSync(join(root, "starts"), "utf8").trim().split("\n").length,
    builds: existsSync(join(root, "builds"))
      ? readFileSync(join(root, "builds"), "utf8").trim().split("\n").length
      : 0,
  };
}

describe.runIf(!!bun)("stale build bootstrap", () => {
  it("rebuilds once, then runs the same command from a fresh process", () => {
    const result = run(fixture(true));
    expect(result.status).toBe(7);
    expect(result.output).toEqual({
      argv: ["check", "--changed", "main"],
      stale: false,
      guard: null,
    });
    expect(result.starts).toBe(2);
    expect(result.builds).toBe(1);
  });

  it("does not rebuild an already fresh checkout", () => {
    const result = run(fixture(false));
    expect(result.status).toBe(7);
    expect(result.starts).toBe(1);
    expect(result.builds).toBe(0);
  });

  it("makes only one attempt when a successful build leaves the marker stale", () => {
    const result = run(fixture(true), { TEST_BUILD_NOOP: "1" });
    expect(result.status).toBe(9);
    expect(result.output.stale).toBe(true);
    expect(result.output.guard).toBeNull();
    expect(result.starts).toBe(2);
    expect(result.builds).toBe(1);
  });

  it("preserves the existing failure when the build fails", () => {
    const result = run(fixture(true), { TEST_BUILD_FAIL: "1" });
    expect(result.status).toBe(9);
    expect(result.output.stale).toBe(true);
    expect(result.starts).toBe(1);
    expect(result.builds).toBe(1);
  });
});
