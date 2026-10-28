#!/usr/bin/env bun
/** Runner install/build/tests also emit the check step wire format (#0970).
 * Kept dependency-free so it works before install and before dist exists.
 */
import { spawnSync } from "node:child_process";

const [name, command, ...args] = process.argv.slice(2);
if (!name || !command) throw new Error("Usage: time-step.mjs <step> <command> [args...]");
const started = performance.now();
const result = spawnSync(command, args, { stdio: "inherit" });
const status = result.status === 0 ? "passed" : "failed";
console.log(
  "::repoos-check-step::" +
    JSON.stringify({
      name,
      status,
      durationMs: Math.round(performance.now() - started),
    }),
);
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
