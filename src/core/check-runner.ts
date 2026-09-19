/**
 * The execution engine behind a declarative check plan (#0446): run one step
 * as a subprocess, with an explicit result for every way it can end.
 *
 * Every outcome is distinguishable in the results block —
 *
 * - `passed` — the command exited 0
 * - `failed` — the command ran and exited non-zero
 * - `timeout` — it exceeded the step's `timeoutMs` and was killed
 * - `missing-prereq` — a binary the step declared (or needs) is not on PATH
 * - `skipped` — the step was explicitly excluded (profile, changed paths,
 *   blocked by a failed dependency, or not applicable to this repo)
 *
 * A missing prerequisite is a FAILURE of a required step, never a pass: the
 * point of declaring `requires = ["go"]` is that a machine without Go must not
 * report a green definition of done. The diagnostic is install-oriented so the
 * fix is one copy-paste away.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

import type { CheckStep } from "./check-plan.js";
import { EMPTY_MARKERS, type RepoMarkers } from "./check-plan.js";

/** How a step ended. Printed distinctly by `repoos check`. */
export type StepStatus = "passed" | "failed" | "timeout" | "missing-prereq" | "skipped";

export interface StepRunResult {
  name: string;
  status: StepStatus;
  /** The command actually run (a `kind` step fills this in once resolved). */
  command?: string;
  /** Working directory the step ran in, repo-relative when known. */
  cwd?: string;
  durationMs: number;
  /** Captured output (capped), shown on failure and kept off success. */
  output?: string;
  /** Human-readable reason: failure detail, or why the step skipped. */
  detail?: string;
  /** False for an advisory step — its failure does not fail the gate. */
  required: boolean;
}

/** Max captured output per step (2 MiB) — enough context, no runaway buffers. */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export interface RunCommandOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Echo the child's output as it arrives (default true). */
  echo?: boolean;
}

export interface CommandResult {
  status: "passed" | "failed" | "timeout" | "error";
  exitCode: number | null;
  output: string;
  durationMs: number;
  /** Spawn failure message (`error` status only), e.g. ENOENT. */
  error?: string;
}

/**
 * Run a shell command, streaming its output through while capturing it, and
 * kill it if it overruns `timeoutMs`.
 *
 * Streaming matters: a full test suite runs for minutes, and a gate that only
 * prints at the end looks hung. Capturing matters too: the close-out pipeline
 * parses `repoos check`'s results block, so the failure detail has to name
 * what failed rather than just "non-zero exit".
 */
export function runCommand(opts: RunCommandOptions): Promise<CommandResult> {
  const started = Date.now();
  const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : undefined;

  return new Promise((resolve) => {
    let chunks = "";
    let killed = false;
    let settled = false;
    const child = spawn(opts.command, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group, so a timeout can signal the whole tree. Killing
      // only the `sh -c` wrapper leaves its children (vitest workers, a JVM,
      // `gradle`) running: they inherit the pipes, so `close` never fires and
      // the gate hangs past the step's own timeout.
      detached: true,
    });

    const finish = (result: Omit<CommandResult, "durationMs" | "output">): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      stopRelaying();
      resolve({
        ...result,
        output: chunks,
        durationMs: Date.now() - started,
      });
    };

    const capture = (buf: Buffer): void => {
      if (chunks.length < MAX_OUTPUT_BYTES) {
        chunks += buf.toString("utf8");
        if (chunks.length > MAX_OUTPUT_BYTES) chunks = chunks.slice(0, MAX_OUTPUT_BYTES);
      }
      if (opts.echo !== false) process.stdout.write(buf);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);

    let timer: NodeJS.Timeout | undefined;
    /**
     * Signal the whole group the child leads, falling back to the child alone
     * when group signalling isn't available (Windows) or the group is gone.
     */
    const killTree = (signal: NodeJS.Signals): void => {
      const pid = child.pid;
      if (pid !== undefined) {
        try {
          process.kill(-pid, signal);
          return;
        } catch {
          /* no process group (Windows) — fall through to the single child */
        }
      }
      try {
        child.kill(signal);
      } catch {
        /* already exited */
      }
    };
    if (timeoutMs) {
      timer = setTimeout(() => {
        killed = true;
        killTree("SIGTERM");
        // A child that ignores SIGTERM (a wrapper script, a JVM) must not hold
        // the gate open past its timeout.
        setTimeout(() => {
          if (!settled) killTree("SIGKILL");
        }, 5_000).unref?.();
      }, timeoutMs);
    }

    // The child leads its own process group, which is what makes a group kill
    // possible — but it also means a terminal Ctrl-C (SIGINT to the CLI's
    // group) no longer reaches it. Without this, interrupting `repoos check`
    // would orphan a running test suite or JVM and leave it holding the
    // terminal. Relay the signal to the tree, then exit ourselves.
    const relay = (signal: NodeJS.Signals): void => {
      killTree(signal === "SIGINT" ? "SIGTERM" : signal);
      process.exit(signal === "SIGINT" ? 130 : 143);
    };
    const relayed: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    for (const sig of relayed) process.on(sig, relay);
    const stopRelaying = (): void => {
      for (const sig of relayed) process.off(sig, relay);
    };

    child.on("error", (err) => {
      finish({ status: "error", exitCode: null, error: (err as Error).message });
    });
    child.on("close", (code, signal) => {
      if (killed || signal === "SIGTERM" || signal === "SIGKILL") {
        finish({ status: "timeout", exitCode: code });
        return;
      }
      finish({ status: code === 0 ? "passed" : "failed", exitCode: code });
    });
  });
}

// ── Prerequisites ───────────────────────────────────────────────────────

/**
 * Install-oriented hints for the tools a check step is likely to need. A
 * missing tool is only actionable if the message says how to get it — "go: not
 * found" tells nobody anything they didn't already know.
 */
const INSTALL_HINTS: Record<string, string> = {
  bun: "install Bun: `curl -fsSL https://bun.sh/install | bash` (https://bun.sh)",
  node: "install Node.js 20+ (https://nodejs.org)",
  npm: "install npm — it ships with Node.js (https://nodejs.org)",
  npx: "install npm — it ships with Node.js (https://nodejs.org)",
  pnpm: "install pnpm: `curl -fsSL https://get.pnpm.io/install.sh | sh` (https://pnpm.io)",
  yarn: "install Yarn: `npm i -g yarn` (https://yarnpkg.com)",
  go: "install Go (https://go.dev/dl) and make sure `go` is on PATH",
  gofmt: "install Go — gofmt ships with it (https://go.dev/dl)",
  cargo: "install Rust with rustup (https://rustup.rs), which provides `cargo`",
  rustc: "install Rust with rustup (https://rustup.rs)",
  rustfmt: "install Rust with rustup (https://rustup.rs), then `rustup component add rustfmt`",
  gradle:
    "install Gradle (https://gradle.org/install) — or commit a `gradlew` wrapper and point the step at `./gradlew`",
  java: "install a JDK (https://adoptium.net)",
  javac: "install a JDK (https://adoptium.net)",
  python3: "install Python 3 (https://www.python.org/downloads)",
  python: "install Python 3 (https://www.python.org/downloads)",
  uv: "install uv: `curl -LsSf https://astral.sh/uv/install.sh | sh` (https://docs.astral.sh/uv)",
  docker: "install Docker (https://docs.docker.com/get-docker)",
  xcodebuild: "install Xcode command line tools: `xcode-select --install`",
  swift: "install Swift (https://swift.org/install)",
  make: "install make (Xcode command line tools on macOS: `xcode-select --install`; `apt install make` on Debian)",
  git: "install git (https://git-scm.com/downloads)",
};

/** Copy-pasteable install advice for a missing tool. */
export function installHint(tool: string): string {
  return INSTALL_HINTS[tool] ?? `install "${tool}" and make sure it is on PATH`;
}

/** Whether `tool` resolves as an executable (absolute path, or on PATH). */
export function hasBinary(tool: string): boolean {
  if (!tool) return false;
  if (tool.includes("/")) {
    try {
      return existsSync(tool) && statSync(tool).isFile();
    } catch {
      return false;
    }
  }
  const path = process.env.PATH ?? "";
  const ext =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of path.split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    for (const e of ext) {
      try {
        const candidate = join(dir, tool + e);
        if (existsSync(candidate) && statSync(candidate).isFile()) return true;
      } catch {
        /* unreadable PATH entry — keep looking */
      }
    }
  }
  return false;
}

/** The subset of `tools` that is not installed, in declaration order. */
export function missingBinaries(tools: string[]): string[] {
  return tools.filter((t) => !hasBinary(t));
}

/** The `missing-prereq` detail for a step whose tools are absent. */
export function prereqDetail(missing: string[]): string {
  const list = missing.map((t) => `${t} — ${installHint(t)}`);
  return `missing prerequisite${missing.length > 1 ? "s" : ""}: ${list.join("; ")}`;
}

// ── Repo markers (what the inference path reads) ────────────────────────

/**
 * Detect the stack markers a repo carries, so an undeclared plan can still be
 * meaningful. Deliberately shallow: file presence and `package.json` scripts,
 * never a guess at what a build "probably" is.
 */
export function detectRepoMarkers(repoRoot: string): RepoMarkers {
  const exists = (rel: string): boolean => {
    try {
      return existsSync(join(repoRoot, rel));
    } catch {
      return false;
    }
  };
  let scripts: Record<string, string> = {};
  if (exists("package.json")) {
    try {
      const raw = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
        scripts?: Record<string, string>;
      };
      scripts = raw.scripts ?? {};
    } catch {
      scripts = {};
    }
  }
  return {
    ...EMPTY_MARKERS,
    hasGoMod: exists("go.mod"),
    hasCargoToml: exists("Cargo.toml"),
    hasGradlew: exists("gradlew") || exists("gradlew.bat"),
    hasGradleBuild: exists("build.gradle") || exists("build.gradle.kts"),
    hasPackageJson: exists("package.json"),
    hasBunLock: exists("bun.lock") || exists("bun.lockb"),
    scripts,
  };
}

/** Resolve a step's `cwd` to an absolute path, or undefined for the repo root. */
export function stepCwd(repoRoot: string, step: CheckStep): string | undefined {
  if (!step.cwd) return undefined;
  return isAbsolute(step.cwd) ? step.cwd : join(repoRoot, step.cwd);
}
