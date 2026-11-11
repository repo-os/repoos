#!/usr/bin/env bun
/**
 * Pre-commit staged-file guard (#1096). Blocks build-output paths, oversized
 * staged files, and obvious secret patterns. Override:
 *   REPOOS_SKIP_STAGED_ARTIFACT_GUARD=1 git commit …
 */
import { accessSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadGuard() {
  const distGuard = join(repoRoot, "dist/core/branch-artifact-guard.js");
  const distConfig = join(repoRoot, "dist/core/config.js");
  try {
    accessSync(distGuard);
    const mod = await import(pathToFileURL(distGuard).href);
    if (typeof mod.evaluateStagedForPreCommit !== "function") {
      throw new Error("dist/core/branch-artifact-guard.js is missing evaluateStagedForPreCommit");
    }
    let check;
    try {
      accessSync(distConfig);
      const cfgMod = await import(pathToFileURL(distConfig).href);
      check = cfgMod.loadConfig(process.cwd()).check;
    } catch {
      check = undefined;
    }
    return { evaluateStagedForPreCommit: mod.evaluateStagedForPreCommit, check };
  } catch {
    const srcGuard = join(repoRoot, "src/core/branch-artifact-guard.ts");
    accessSync(srcGuard);
    const mod = await import(pathToFileURL(srcGuard).href);
    if (typeof mod.evaluateStagedForPreCommit !== "function") {
      throw new Error("src/core/branch-artifact-guard.ts is missing evaluateStagedForPreCommit");
    }
    return { evaluateStagedForPreCommit: mod.evaluateStagedForPreCommit, check: undefined };
  }
}

if (process.env.REPOOS_SKIP_STAGED_ARTIFACT_GUARD === "1") {
  process.exit(0);
}

const top = process.cwd();

try {
  const { evaluateStagedForPreCommit, check } = await loadGuard();
  const { ok, message } = evaluateStagedForPreCommit(top, check);
  if (!ok) {
    console.error("pre-commit: staged artifact guard:\n" + message);
    console.error(
      "Unstage or gitignore build output. Override only when you mean it: REPOOS_SKIP_STAGED_ARTIFACT_GUARD=1",
    );
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(
    "pre-commit: staged artifact guard unavailable — rebuild dist/ or run from a RepoOS checkout.",
  );
  console.error(String(err));
  process.exit(1);
}
