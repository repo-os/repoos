import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRepoOS } from "../../src/core/repoos.js";
import { worktreesDir } from "../../src/core/config.js";
import { runAutoShotCapture } from "../../src/server/shot-capture.js";
import { PreviewManager } from "../../src/server/preview.js";
import { runUiHandoffGate } from "../../src/server/ui-handoff-gate.js";
import { shotsDir } from "../../src/server/shots.js";
import { runGit } from "../../src/core/git.js";

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

/** Run existing RepoOS capture code in an isolated runner checkout. */
export async function captureBrowserEvidence(
  root: string,
  taskId: string,
  mode: "shots" | "verify" | "both",
  outputDir: string,
): Promise<{ ok: boolean; detail: string }> {
  const repoos = createRepoOS(root);
  const config = repoos.config;
  const task = repoos.getTask(taskId);
  if (!task) throw new Error(`Task #${taskId} was not found in the runner bundle`);
  if (!task.branch) throw new Error(`Task #${taskId} has no branch`);

  const linked = join(worktreesDir(root), task.branch);
  const linkedCheck = await runGit(linked, ["rev-parse", "--show-toplevel"], 10_000);
  if (linkedCheck.status !== 0) {
    throw new Error(`runner worktree for ${task.branch} is missing`);
  }

  mkdirSync(outputDir, { recursive: true });
  const previews = new PreviewManager(config, () => {});
  const log = (_id: string, _level: "info" | "warn" | "error", _message: string): void => {};
  let ok = true;
  const results: Record<string, unknown> = {};
  try {
    if (mode === "shots" || mode === "both") {
      const shots = await runAutoShotCapture(config, task, previews, log);
      results.shots = shots;
      if (shots.status === "failed") ok = false;
    }
    if (mode === "verify" || mode === "both") {
      const verification = await runUiHandoffGate(config, task, previews, log, {
        forceRefresh: true,
        recordTaskNotes: false,
      });
      results.verification = verification;
      if (!verification.ok) ok = false;
    }

    const sourceShots = shotsDir(linked, config.workDir, taskId);
    const targetShots = join(outputDir, "shots");
    try {
      cpSync(sourceShots, targetShots, { recursive: true, errorOnExist: false, force: true });
    } catch {
      // A verification-only run may legitimately produce no screenshots.
    }
    const verifyPath = join(config.root, config.cacheDir, "ui-verification", `${taskId}.json`);
    try {
      cpSync(verifyPath, join(outputDir, "verification.json"));
    } catch {
      // Shots-only runs do not create a verification record.
    }

    const files: { name: string; data: string }[] = [];
    let bytes = 0;
    const shotManifestPath = join(targetShots, "shots.json");
    if (statSync(targetShots, { throwIfNoEntry: false })?.isDirectory()) {
      for (const name of readdirSync(targetShots).sort()) {
        if (!/^[a-zA-Z0-9._-]+\.(png|json)$/.test(name)) continue;
        const path = resolve(targetShots, name);
        if (basename(path) !== name) throw new Error("unsafe artifact path");
        const data = readFileSync(path);
        bytes += data.length;
        if (bytes > MAX_ARTIFACT_BYTES) throw new Error("capture artifacts exceed 50 MiB");
        files.push({ name: `shots/${name}`, data: data.toString("base64") });
      }
    }
    if (statSync(join(outputDir, "verification.json"), { throwIfNoEntry: false })?.isFile()) {
      const data = readFileSync(join(outputDir, "verification.json"));
      bytes += data.length;
      if (bytes > MAX_ARTIFACT_BYTES) throw new Error("capture artifacts exceed 50 MiB");
      files.push({ name: "verification.json", data: data.toString("base64") });
    }
    writeFileSync(
      join(outputDir, "result.json"),
      JSON.stringify({ version: 1, taskId, ok, results, files, bytes }, null, 2),
    );
    return {
      ok,
      detail: ok ? "runner browser capture completed" : "runner browser capture reported failures",
    };
  } finally {
    await previews.stop(taskId, "remote browser evidence capture complete");
    await previews.dispose();
  }
}

if (import.meta.main) {
  const [taskId, modeArg, outputDir] = process.argv.slice(2);
  const mode = modeArg === "verify" || modeArg === "both" ? modeArg : "shots";
  const dir = outputDir || "/artifacts/browser-capture";
  captureBrowserEvidence(process.cwd(), taskId ?? "", mode, dir)
    .then((result) => {
      console.log(`[browser-capture] ${result.detail}`);
      if (!result.ok) process.exitCode = 2;
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[browser-capture] failed: ${detail}`);
      process.exitCode = 3;
    });
}
