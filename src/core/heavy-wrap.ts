/**
 * PATH shim target (#0961). Invoked as `bun heavy-wrap.ts <user args...>` with
 * REPOOS_HEAVY_TOOL / REPOOS_HEAVY_REAL / REPOOS_HEAVY_ROOT set by the shell shim.
 */
import { spawn } from "node:child_process";
import { loadConfig } from "./config.js";
import { acquireLocalCheckSlot } from "./local-gates.js";
import { applyEngineerResourceEnv, isHeavyInvocation } from "./engineer-resources.js";

const tool = process.env.REPOOS_HEAVY_TOOL || "bun";
const real = process.env.REPOOS_HEAVY_REAL || tool;
const root = process.env.REPOOS_HEAVY_ROOT || process.cwd();
const args = process.argv.slice(2);

function run(held: boolean): Promise<number> {
  return new Promise((resolve) => {
    const env = { ...process.env };
    if (held) env.REPOOS_HEAVY_SLOT_HELD = "1";
    try {
      applyEngineerResourceEnv(env, loadConfig(root));
    } catch {
      /* config optional — still exec */
    }
    const child = spawn(real, args, { stdio: "inherit", env });
    child.on("exit", (code, signal) => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      resolve(code ?? 1);
    });
    child.on("error", () => resolve(127));
  });
}

const heavy =
  process.env.REPOOS_HEAVY_SLOT_HELD !== "1" &&
  process.env.REPOOS_LOCAL_CHECK_SLOT_HELD !== "1" &&
  isHeavyInvocation(tool, args);

if (!heavy) {
  process.exit(await run(false));
}

let code = 1;
let release: (() => void) | undefined;
try {
  const config = loadConfig(root);
  release = await acquireLocalCheckSlot({
    repoRoot: root,
    config,
    env: process.env,
    skipPressure: false,
  });
  code = await run(true);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`heavy slot: ${message}`);
  code = 1;
} finally {
  release?.();
}
process.exit(code);
