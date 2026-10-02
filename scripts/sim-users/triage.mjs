#!/usr/bin/env bun
// Hand a results directory from run.mjs to an analysis agent (Claude) that writes TRIAGE.md.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] && resolve(process.argv[2]);
if (!dir) {
  console.error("usage: bun scripts/sim-users/triage.mjs <results-dir> [model]");
  process.exit(1);
}
const model = process.argv[3] ?? "sonnet";
const here = dirname(fileURLToPath(import.meta.url));
const prompt = readFileSync(join(here, "prompts/triage.md"), "utf8").replaceAll(
  "{{RESULTS_DIR}}",
  dir,
);
const r = spawnSync(
  "claude",
  ["-p", prompt, "--model", model, "--dangerously-skip-permissions", "--add-dir", dir],
  { cwd: dir, stdio: "inherit" },
);
process.exit(r.status ?? 1);
