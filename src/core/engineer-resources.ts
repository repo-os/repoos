/**
 * Bounds engineer-launched builds and tests (#0961).
 *
 * Worker caps travel in the spawn environment. Heavy commands (`bun run build*`,
 * `bun run test*`, `vue-tsc`, `vitest`, `playwright`) also take a machine-wide
 * slot from the local-check pool via a PATH shim, so five engineers share
 * `heavySlots` instead of five full stacks.
 */
import { accessSync, chmodSync, constants, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { playwrightWorkerLimit, vitestMaxWorkers } from "./resource-limits.js";

const HEAVY_TOOLS = ["bun", "vitest", "vue-tsc", "playwright"] as const;

export function engineerResourceEnv(config: RepoOSConfig): NodeJS.ProcessEnv {
  const vitest = String(vitestMaxWorkers(config));
  const playwright = String(playwrightWorkerLimit(config));
  return {
    VITEST_MAX_WORKERS: vitest,
    VITEST_MAX_THREADS: vitest,
    VITEST_MIN_WORKERS: "1",
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

/** True when this argv is a build, test, typecheck or browser run. */
export function isHeavyInvocation(tool: string, args: string[]): boolean {
  const base = tool.split("/").pop() ?? tool;
  if (base === "vitest" || base === "vue-tsc" || base === "playwright") return true;
  if (base !== "bun" && base !== "bunx") return false;
  const rest = args.filter((a) => a !== "--bun");
  if (rest[0] === "x" || rest[0] === "exec") {
    const next = rest[1] ?? "";
    return /^(vitest|vue-tsc|playwright|tsc)(@|$)/.test(next);
  }
  if (rest[0] !== "run" && rest[0] !== "--bun") return false;
  const script = rest[0] === "run" ? (rest[1] ?? "") : "";
  return /^(build|test|check)(\b|:|$)/.test(script);
}

function which(bin: string, pathEnv: string | undefined): string | null {
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (pathEnv ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = join(dir, `${bin}${extension}`);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep searching unreadable or missing PATH entries.
      }
    }
  }
  return null;
}

/**
 * Write PATH shims that acquire a heavy slot before exec. Returns the directory
 * to prepend, or null when no real binaries were found.
 */
export function installEngineerPathShims(repoRoot: string, cacheDir: string): string | null {
  const binDir = join(repoRoot, cacheDir, "bin");
  mkdirSync(binDir, { recursive: true });
  const wrap = join(repoRoot, "src/core/heavy-wrap.ts");
  const pathWithoutShim = (process.env.PATH ?? "")
    .split(":")
    .filter((p) => p && p !== binDir)
    .join(":");
  let wrote = 0;
  for (const tool of HEAVY_TOOLS) {
    const real = which(tool, pathWithoutShim);
    if (!real || real.startsWith(binDir)) continue;
    const script = `#!/bin/sh
export REPOOS_HEAVY_TOOL=${tool}
export REPOOS_HEAVY_REAL=${JSON.stringify(real)}
export REPOOS_HEAVY_ROOT=${JSON.stringify(repoRoot)}
exec ${JSON.stringify(real.endsWith("/bun") ? real : which("bun", pathWithoutShim) || "bun")} ${JSON.stringify(wrap)} "$@"
`;
    const path = join(binDir, tool);
    writeFileSync(path, script, "utf8");
    chmodSync(path, 0o755);
    wrote++;
  }
  return wrote > 0 ? binDir : null;
}

export function prependPath(env: NodeJS.ProcessEnv, dir: string): void {
  const parts = (env.PATH ?? "").split(":").filter((p) => p && p !== dir);
  env.PATH = [dir, ...parts].join(":");
}
