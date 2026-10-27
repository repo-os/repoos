/**
 * Bounds engineer-launched builds and tests (#0961).
 *
 * Worker caps travel in the spawn environment. Heavy commands (`bun run build*`,
 * `bun run test*`, `vue-tsc`, `vitest`, `playwright`) also take a machine-wide
 * slot from the local-check pool via a PATH shim, so five engineers share
 * `heavySlots` instead of five full stacks.
 */
import { chmodSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { RepoOSConfig } from "./types.js";
import { playwrightWorkerLimit, vitestMaxWorkers } from "./resource-limits.js";

const HEAVY_TOOLS = ["bun", "bunx", "tsc", "vitest", "vue-tsc", "vite", "playwright"] as const;

export function engineerResourceEnv(config: RepoOSConfig): NodeJS.ProcessEnv {
  const vitest = String(vitestMaxWorkers(config));
  const playwright = String(playwrightWorkerLimit(config));
  return {
    VITEST_MAX_WORKERS: vitest,
    VITEST_MAX_THREADS: vitest,
    VITEST_MIN_WORKERS: "1",
    // RepoOS's own Vite config and check runner use this knob. VITEST_MAX_WORKERS
    // covers projects that rely on Vitest's native environment override.
    REPOOS_TEST_WORKERS: vitest,
    PLAYWRIGHT_WORKERS: playwright,
    PLAYWRIGHT_MAX_WORKERS: playwright,
  };
}

export function applyEngineerResourceEnv(
  env: NodeJS.ProcessEnv,
  config: RepoOSConfig,
): NodeJS.ProcessEnv {
  Object.assign(env, engineerResourceEnv(config));
  return env;
}

function toolName(tool: string): string {
  return tool.split(/[\\/]/).pop() ?? tool;
}

function isHeavyPackage(name: string): boolean {
  return /^(vitest|vue-tsc|playwright|tsc)(@|$)/.test(name);
}

/** True when this argv is a build, test, typecheck or browser run. */
export function isHeavyInvocation(tool: string, args: string[]): boolean {
  const base = toolName(tool);
  if (["tsc", "vitest", "vue-tsc", "playwright"].includes(base)) return true;
  if (base === "vite") return args[0] === "build";
  if (base !== "bun" && base !== "bunx") return false;
  const rest = args.filter((a) => a !== "--bun");
  if (base === "bunx") return isHeavyPackage(rest[0] ?? "");
  if (rest[0] === "x" || rest[0] === "exec") return isHeavyPackage(rest[1] ?? "");
  if (rest[0] === "build" || rest[0] === "test") return true;
  if (rest[0] !== "run") return false;
  return /^(build|test|check)(\b|:|$)/.test(rest[1] ?? "");
}

function boundedWorkerValue(raw: string | undefined, cap: number): string {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return String(cap);
  return String(Math.min(cap, Math.floor(parsed)));
}

/** Playwright has no standard worker environment variable; use its CLI flag. */
function capPlaywrightArgs(args: string[], cap: number): string[] {
  if (args[0] !== "test") return args;
  const out: string[] = [];
  let found = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--workers") {
      out.push(`--workers=${boundedWorkerValue(args[++i], cap)}`);
      found = true;
    } else if (arg.startsWith("--workers=")) {
      out.push(`--workers=${boundedWorkerValue(arg.slice("--workers=".length), cap)}`);
      found = true;
    } else {
      out.push(arg);
    }
  }
  if (!found) out.push(`--workers=${cap}`);
  return out;
}

function nextBunArg(args: string[], start: number): number {
  for (let i = start; i < args.length; i++) {
    if (args[i] !== "--bun") return i;
  }
  return -1;
}

/** Apply worker limits that need argv, including Playwright through bun/bunx. */
export function withEngineerWorkerArgs(
  tool: string,
  args: string[],
  config: RepoOSConfig,
): string[] {
  const base = toolName(tool);
  const cap = playwrightWorkerLimit(config);
  if (base === "playwright") return capPlaywrightArgs(args, cap);
  if (base !== "bun" && base !== "bunx") return args;
  const command = nextBunArg(args, 0);
  if (command < 0 || (base === "bun" && args[command] !== "x" && args[command] !== "exec")) {
    return args;
  }
  const pkg = base === "bunx" ? command : nextBunArg(args, command + 1);
  if (pkg < 0 || !/^playwright(@|$)/.test(args[pkg])) return args;
  return [...args.slice(0, pkg + 1), ...capPlaywrightArgs(args.slice(pkg + 1), cap)];
}

function which(bin: string, pathEnv: string | undefined): string | null {
  const result = spawnSync("/bin/sh", ["-c", `command -v ${bin}`], {
    encoding: "utf8",
    env: { ...process.env, PATH: pathEnv ?? "" },
  });
  const found = result.stdout.trim().split("\n")[0]?.trim();
  return result.status === 0 && found ? found : null;
}

function heavyWrapPath(): string {
  if (import.meta.url.startsWith("file:")) {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const compiled = join(moduleDir, "heavy-wrap.js");
    return existsSync(compiled) ? compiled : join(moduleDir, "heavy-wrap.ts");
  }
  // Vitest rewrites import.meta.url to an http: URL. Its suites run from the
  // repo root, so the source-tree wrapper remains resolvable in that harness.
  return join(process.cwd(), "src/core/heavy-wrap.ts");
}

/** Quote one literal for the POSIX shell shims, including paths with spaces. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

/**
 * Write PATH shims that acquire a heavy slot before exec. Returns the directory
 * to prepend, or null when no real binaries were found. The wrapper is resolved
 * beside this module (dist/core in a packaged install), never in the managed repo.
 */
export function installEngineerPathShims(
  repoRoot: string,
  cacheDir: string,
  pathEnv: string | undefined = process.env.PATH,
): string | null {
  if (process.platform === "win32") return null;
  const binDir = join(repoRoot, cacheDir, "bin");
  const wrap = heavyWrapPath();
  if (!existsSync(wrap)) return null;
  const pathWithoutShim = (pathEnv ?? "")
    .split(":")
    .filter((p) => p && p !== binDir)
    .join(":");
  // Source checkouts need Bun for heavy-wrap.ts; packaged dist/core/heavy-wrap.js
  // also runs under the Node fallback supported by the CLI launcher.
  const wrapperRuntime = wrap.endsWith(".ts")
    ? process.versions.bun
      ? process.execPath
      : which("bun", pathWithoutShim)
    : process.execPath;
  if (!wrapperRuntime) return null;
  mkdirSync(binDir, { recursive: true });
  let wrote = 0;
  for (const tool of HEAVY_TOOLS) {
    const real = which(tool, pathWithoutShim);
    if (!real || real.startsWith(binDir)) continue;
    const script = `#!/bin/sh
export REPOOS_HEAVY_TOOL=${shellQuote(tool)}
export REPOOS_HEAVY_REAL=${shellQuote(real)}
export REPOOS_HEAVY_ROOT=${shellQuote(repoRoot)}
exec ${shellQuote(wrapperRuntime)} ${shellQuote(wrap)} "$@"
`;
    const path = join(binDir, tool);
    // A concurrent engineer spawn may install the same shared shims. Never let
    // another process observe a half-written executable.
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, script, "utf8");
    chmodSync(tmp, 0o755);
    renameSync(tmp, path);
    wrote++;
  }
  return wrote > 0 ? binDir : null;
}

export function prependPath(env: NodeJS.ProcessEnv, dir: string): void {
  const parts = (env.PATH ?? "").split(":").filter((p) => p && p !== dir);
  env.PATH = [dir, ...parts].join(":");
}
