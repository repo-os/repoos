import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createRepoOS } from "../../src/core/repoos.js";
import { worktreePathForBranch } from "../../src/core/git.js";
import type { LogLevel } from "../../src/core/logger.js";
import { captureDeclaredShot, runAutoShotCapture } from "../../src/server/shot-capture.js";
import { PreviewManager } from "../../src/server/preview.js";
import { runUiHandoffGate } from "../../src/server/ui-handoff-gate.js";
import { shotsDir } from "../../src/server/shots.js";

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

/** Run existing RepoOS capture code in an isolated runner checkout. */
async function captureBrowserEvidenceImpl(
  root: string,
  taskId: string,
  mode: "shots" | "verify" | "both" | "single-shot",
  outputDir: string,
  entry?: import("../../src/core/shot-plan.js").CaptureEntry & { route: string },
): Promise<{ ok: boolean; detail: string }> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = "/ms-playwright";
  const repoos = createRepoOS(root);
  const config = repoos.config;
  const captureConfig = {
    ...config,
    remoteValidation: { ...config.remoteValidation, browserCaptureMode: "local" as const },
  };
  const task = repoos.getTask(taskId);
  if (!task) throw new Error(`Task #${taskId} was not found in the runner bundle`);
  if (!task.branch) throw new Error(`Task #${taskId} has no branch`);
  if (task.branch.includes("..") || task.branch.includes("\\") || task.branch.startsWith("/")) {
    throw new Error("task branch contains an unsafe path");
  }

  const linked = worktreePathForBranch(root, task.branch);
  if (!linked) {
    throw new Error(`runner worktree for ${task.branch} is missing`);
  }

  mkdirSync(outputDir, { recursive: true });
  const previews = new PreviewManager(captureConfig, () => {});
  const log = (_id: string, _level: LogLevel, _message: string): void => {};
  let ok = true;
  const results: Record<string, unknown> = {};
  try {
    if (mode === "single-shot") {
      if (!entry) throw new Error("single-shot request omitted its capture entry");
      const captured = await captureDeclaredShot(captureConfig, task, previews, entry);
      results.singleShot = captured;
      if ("error" in captured) ok = false;
    }
    if (mode === "shots" || mode === "both") {
      const shots = await runAutoShotCapture(captureConfig, task, previews, log);
      results.shots = shots;
      if (shots.status === "failed") ok = false;
    }
    if (mode === "verify" || mode === "both") {
      const verification = await runUiHandoffGate(captureConfig, task, previews, log, {
        forceRefresh: true,
        recordTaskNotes: false,
      });
      results.verification = verification;
      if (!verification.ok) ok = false;
    }

    const sourceShots = shotsDir(config.root, config.workDir, taskId);
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
    const browserUnavailable =
      /playwright|webkit|browser executable|executable doesn.t exist|not installed/i.test(
        JSON.stringify(results),
      );
    writeFileSync(
      join(outputDir, "result.json"),
      JSON.stringify(
        {
          version: 1,
          taskId,
          ok,
          detail: ok
            ? "runner browser capture completed"
            : "runner browser capture reported failures",
          results,
          files,
          bytes,
          ...(browserUnavailable ? { browserUnavailable: true } : {}),
        },
        null,
        2,
      ),
    );
    return {
      ok,
      detail: ok ? "runner browser capture completed" : "runner browser capture reported failures",
    };
  } finally {
    await previews.stop(taskId, "remote browser evidence capture complete");
  }
}

/** Always leave a machine-readable result, including setup/build failures. */
export async function captureBrowserEvidence(
  root: string,
  taskId: string,
  mode: "shots" | "verify" | "both" | "single-shot",
  outputDir: string,
  entry?: import("../../src/core/shot-plan.js").CaptureEntry & { route: string },
): Promise<{ ok: boolean; detail: string }> {
  try {
    return await captureBrowserEvidenceImpl(root, taskId, mode, outputDir, entry);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    mkdirSync(outputDir, { recursive: true });
    const browserUnavailable =
      /playwright|webkit|browser executable|executable doesn.t exist|not installed/i.test(detail);
    writeFileSync(
      join(outputDir, "result.json"),
      JSON.stringify(
        {
          version: 1,
          taskId,
          ok: false,
          detail,
          results: { error: detail },
          files: [],
          bytes: 0,
          ...(browserUnavailable ? { browserUnavailable: true } : {}),
        },
        null,
        2,
      ),
    );
    return { ok: false, detail };
  }
}

if (import.meta.main) {
  const [taskId, modeArg, outputDir] = process.argv.slice(2);
  const mode =
    modeArg === "verify" || modeArg === "both" || modeArg === "single-shot" ? modeArg : "shots";
  const dir = outputDir || "/artifacts/browser-capture";
  let entry: (import("../../src/core/shot-plan.js").CaptureEntry & { route: string }) | undefined;
  if (mode === "single-shot") {
    try {
      entry = JSON.parse(process.env.REPOOS_BROWSER_CAPTURE_ENTRY ?? "") as typeof entry;
    } catch {
      console.error("[browser-capture] single-shot request has invalid entry JSON");
      process.exitCode = 3;
    }
  }
  if (process.exitCode !== 3)
    captureBrowserEvidence(process.env.REPOOS_ROOT || process.cwd(), taskId ?? "", mode, dir, entry)
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
