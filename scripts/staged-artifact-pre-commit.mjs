#!/usr/bin/env bun
/**
 * Pre-commit staged-file guard (#1096). Blocks build-output paths, oversized
 * staged files, and obvious secret patterns. Override:
 *   REPOOS_SKIP_STAGED_ARTIFACT_GUARD=1 git commit …
 */
import { accessSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let guardPath = join(root, "dist/core/branch-artifact-guard.js");
try {
  accessSync(guardPath);
} catch {
  guardPath = join(root, "src/core/branch-artifact-guard.ts");
}
const { evaluateStagedForPreCommit } = await import(pathToFileURL(guardPath).href);

if (process.env.REPOOS_SKIP_STAGED_ARTIFACT_GUARD === "1") {
  process.exit(0);
}

const top = process.cwd();

const { ok, message } = evaluateStagedForPreCommit(top, {});
if (!ok) {
  console.error("pre-commit: staged artifact guard:\n" + message);
  console.error(
    "Unstage or gitignore build output. Override only when you mean it: REPOOS_SKIP_STAGED_ARTIFACT_GUARD=1",
  );
  process.exit(1);
}
process.exit(0);
