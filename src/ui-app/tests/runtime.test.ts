import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  isBun,
  resolveBun,
  preferBunForDevTasks,
  reexecServeUnderBunIfRequested,
} from "../../core/runtime.js";

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

// Resolved once, before beforeEach installs a bogus REPOOS_BUN_PATH.
const REAL_BUN: string | null = (() => {
  const prev = process.env.REPOOS_BUN_PATH;
  delete process.env.REPOOS_BUN_PATH;
  try {
    return resolveBun();
  } finally {
    if (prev !== undefined) process.env.REPOOS_BUN_PATH = prev;
  }
})();

const ENV_KEYS = ["REPOOS_RUNTIME", "REPOOS_RUNTIME_REEXEC", "REPOOS_BUN_PATH"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  // Safety: the default (unset) prefers Bun, and an in-process re-exec would
  // replace the vitest worker. Point every in-process test at a bun that
  // cannot resolve; the real switch is covered by subprocess fixtures below.
  process.env.REPOOS_BUN_PATH = "/nonexistent/runtime-test-bun";
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
    expect(resolveBun()).toBeNull(); // beforeEach set a bogus path
  });
});

describe("preferBunForDevTasks", () => {
  function repo(withLock: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "repoos-pref-"));
    if (withLock) writeFileSync(join(dir, "bun.lock"), "");
    return dir;
  }

  it("is false when pinned to Node, even in a Bun repo", () => {
    process.env.REPOOS_RUNTIME = "node";
    const dir = repo(true);
    try {
      expect(preferBunForDevTasks(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is false in a repo with no bun lockfile", () => {
    delete process.env.REPOOS_BUN_PATH; // let it find real bun if present
    const dir = repo(false);
    try {
      expect(preferBunForDevTasks(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is true in a Bun repo when Bun is resolvable and not pinned to Node", () => {
    delete process.env.REPOOS_BUN_PATH; // use the real PATH lookup
    const dir = repo(true);
    try {
      expect(preferBunForDevTasks(dir)).toBe(REAL_BUN !== null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("reexecServeUnderBunIfRequested — no-op cases", () => {
  it("does nothing when pinned to Node", () => {
    process.env.REPOOS_RUNTIME = "node";
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  it("does nothing when the re-exec guard is already set", () => {
    process.env.REPOOS_RUNTIME_REEXEC = "1";
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  it("stays on the current runtime when bun is unresolvable (default mode)", () => {
    // REPOOS_RUNTIME unset -> prefer-bun, but the bogus BUN_PATH -> no bun.
    expect(reexecServeUnderBunIfRequested()).toBe(false);
  });

  it.runIf(!isBun())("warns only for REPOOS_RUNTIME=bun when bun is unresolvable", () => {
    const capture = (): { restore: () => void; text: () => string } => {
      const buf: string[] = [];
      const orig = process.stderr.write.bind(process.stderr);
      (process.stderr.write as unknown as (s: string) => boolean) = (s: string) => {
        buf.push(s);
        return true;
      };
      return { restore: () => (process.stderr.write = orig), text: () => buf.join("") };
    };

    process.env.REPOOS_RUNTIME = "bun";
    let cap = capture();
    try {
      reexecServeUnderBunIfRequested();
    } finally {
      cap.restore();
    }
    expect(cap.text()).toContain("not on PATH");

    // default (unset) and auto stay silent
    for (const mode of ["", "auto"]) {
      process.env.REPOOS_RUNTIME = mode;
      cap = capture();
      try {
        reexecServeUnderBunIfRequested();
      } finally {
        cap.restore();
      }
      expect(cap.text()).toBe("");
    }
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
        { encoding: "utf8", env: { ...process.env, REPOOS_BUN_PATH: "", ...env } },
      );
      return { stdout: out, status: 0 };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { stdout: err.stdout ?? "", status: err.status ?? 1 };
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }

  it("stays on Node when pinned to Node", () => {
    const { stdout, status } = runFixture({ REPOOS_RUNTIME: "node", REPOOS_RUNTIME_REEXEC: "" });
    expect(stdout).toContain("node ");
    expect(stdout).toContain("guard=unset");
    expect(status).toBe(7);
  });

  it.runIf(!!REAL_BUN)("re-execs under Bun by default and propagates exit code", () => {
    // REPOOS_RUNTIME unset -> prefer-bun; bun is on PATH.
    const { stdout, status } = runFixture({ REPOOS_RUNTIME: "", REPOOS_RUNTIME_REEXEC: "" });
    expect(stdout).toContain("bun ");
    expect(stdout).toContain("guard=1");
    expect(status).toBe(7);
  });
});
