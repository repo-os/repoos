import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { isBun, resolveBun, reexecServeUnderBunIfRequested } from "../../core/runtime.js";

function findRuntimeSrc(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "src", "core", "runtime.ts");
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve("src/core/runtime.ts");
}
const RUNTIME_SRC = findRuntimeSrc();

const ENV_KEYS = [
  "REPOOS_RUNTIME",
  "REPOOS_RUNTIME_REEXEC",
  "REPOOS_BUN_PATH",
] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("isBun", () => {
  it("reflects the current runtime", () => {
    expect(isBun()).toBe(typeof (process.versions as { bun?: string }).bun === "string");
  });
});

describe("resolveBun", () => {
  it("returns an explicit REPOOS_BUN_PATH that exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "repoos-bun-"));
    try {
      const fake = join(dir, "bun");
      writeFileSync(fake, "#!/bin/sh\necho 1.0.0\n");
      chmodSync(fake, 0o755);
      process.env.REPOOS_BUN_PATH = fake;
      expect(resolveBun()).toBe(fake);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns null for a REPOOS_BUN_PATH that does not exist", () => {
    process.env.REPOOS_BUN_PATH = "/definitely/not/a/real/bun";
    expect(resolveBun()).toBeNull();
  });
});

describe("reexecServeUnderBunIfRequested — no-op cases", () => {
  it("does nothing when REPOOS_RUNTIME is unset", () => {
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  it("does nothing for REPOOS_RUNTIME=node", () => {
    process.env.REPOOS_RUNTIME = "node";
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  it("does nothing when the re-exec guard is already set", () => {
    process.env.REPOOS_RUNTIME = "bun";
    process.env.REPOOS_RUNTIME_REEXEC = "1";
    process.env.REPOOS_BUN_PATH = "/definitely/not/a/real/bun";
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  // These two assert Node-side behavior — under Bun the function bails at the
  // isBun() guard before ever probing for `bun`, so there's nothing to observe.
  it.runIf(!isBun())("stays on Node (and warns) when REPOOS_RUNTIME=bun but bun is unresolvable", () => {
    process.env.REPOOS_RUNTIME = "bun";
    process.env.REPOOS_BUN_PATH = "/definitely/not/a/real/bun";
    const errs: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => {
      errs.push(s);
      return true;
    };
    try {
      expect(reexecServeUnderBunIfRequested()).toBe(false);
    } finally {
      process.stderr.write = orig;
    }
    expect(errs.join("")).toContain("not on PATH");
  });

  it.runIf(!isBun())("stays silent for REPOOS_RUNTIME=auto when bun is unresolvable", () => {
    process.env.REPOOS_RUNTIME = "auto";
    process.env.REPOOS_BUN_PATH = "/definitely/not/a/real/bun";
    const errs: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => {
      errs.push(s);
      return true;
    };
    try {
      expect(reexecServeUnderBunIfRequested()).toBe(false);
    } finally {
      process.stderr.write = orig;
    }
    expect(errs.join("")).toBe("");
  });
});

// The actual re-exec replaces the process image, so it can only be observed
// from a child. This is the Node -> Bun switch, so it's moot when the suite
// itself runs under Bun; and it needs Node's native .ts type stripping
// (>= 22.6 / always on 24) to run the fixture source directly.
const canStripTypes = process.features.typescript !== undefined;
describe.runIf(canStripTypes && !isBun())("reexecServeUnderBunIfRequested — real switch", () => {
  function runFixture(env: Record<string, string>): { stdout: string; status: number } {
    const fixture = mkdtempSync(join(tmpdir(), "repoos-rt-fx-"));
    const file = join(fixture, "fx.ts");
    writeFileSync(
      file,
      `import { reexecServeUnderBunIfRequested } from ${JSON.stringify(RUNTIME_SRC)};\n` +
        `if (process.argv[2] === "serve" && reexecServeUnderBunIfRequested()) {\n` +
        `  /* spawn-fallback parent */\n` +
        `} else {\n` +
        `  const rt = (process.versions as {bun?: string}).bun ? "bun" : "node";\n` +
        `  process.stdout.write(rt + " " + JSON.stringify(process.argv.slice(2)) + " guard=" + (process.env.REPOOS_RUNTIME_REEXEC || "unset"));\n` +
        `  process.exit(process.argv[2] === "serve" ? 7 : 0);\n` +
        `}\n`,
    );
    try {
      const out = execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--no-warnings", file, "serve", "--port", "0"],
        { encoding: "utf8", env: { ...process.env, ...env } },
      );
      return { stdout: out, status: 0 };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { stdout: err.stdout ?? "", status: err.status ?? 1 };
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }

  it("stays on Node with no opt-in", () => {
    const { stdout, status } = runFixture({
      REPOOS_RUNTIME: "",
      REPOOS_RUNTIME_REEXEC: "",
    });
    expect(stdout).toContain("node ");
    expect(stdout).toContain("guard=unset");
    expect(status).toBe(7);
  });

  it.runIf(!!resolveBun())("re-execs under Bun for serve and propagates exit code", () => {
    const { stdout, status } = runFixture({
      REPOOS_RUNTIME: "bun",
      REPOOS_RUNTIME_REEXEC: "",
    });
    expect(stdout).toContain("bun ");
    expect(stdout).toContain("guard=1");
    expect(status).toBe(7);
  });
});
