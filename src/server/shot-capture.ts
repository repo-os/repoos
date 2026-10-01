/**
 * Automatic shot capture at handoff (#0594).
 *
 * #0582 made shot capture opt-in for the engineer agent, and nothing ran it:
 * not one task after #0582 landed shots in the Changes tab. This module is the
 * missing trigger — the server runs the SAME capture itself when a task moves
 * to review and its diff touches a preview target's `[[preview.paths]]` globs,
 * through the server-owned `PreviewManager` (never a hand-rolled `serve`).
 *
 * A capture problem can never fail a handoff: everything here is
 * fire-and-forget, and any skip/failure is recorded visibly — a task-log line
 * plus an activity note — as `shots: skipped — <reason>` / `shots: failed —
 * <reason>`. An engineer-made capture pre-empts the automatic one: when the
 * task already has shots, the automatic pass stands down rather than
 * duplicating (or overwriting) work the engineer chose to do.
 *
 * What to shoot comes from the task's declared `## Shots` section
 * (`core/shot-plan.ts`); without a declaration it falls back to `/` per
 * resolved target, and `core/shot-page.ts` provides the page choreography both
 * paths share.
 */
import {
  buildCapturePlan,
  parseShotPlan,
  provenanceCaption,
  type CaptureEntry,
} from "../core/shot-plan.js";
import { describeTargetPathMatches, resolveShotTargets } from "../core/shot-targets.js";
import type { LogLevel } from "../core/logger.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { isShotCaptureUnavailable } from "../commands/shot.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "../commands/ui-harness.js";
import type { PreviewManager } from "./preview.js";
import { computeTaskShotContext } from "./shot-context.js";
import { localShotStore } from "./shots.js";
import { patchTaskFile } from "./write.js";

export interface ShotCaptureResult {
  status: "captured" | "skipped" | "failed";
  detail: string;
  count?: number;
}

const INSTALL_ADVICE = "Install: bun add -d @playwright/test && bunx playwright install webkit";
const AUTO_SETTLE_MS = 900;
const AUTO_VIEWPORT = { width: 1280, height: 800 };

/** The per-task log line signature the capture writes one entry with. */
type TaskLog = (taskId: string, level: LogLevel, message: string) => void;

/** In-flight captures, so duplicate review transitions never double-run. */
const inFlight = new Set<string>();

/**
 * One preview per task, so each new target must replace the running one
 * (#0379/#0271) — mirrored from the CLI capture path, here via the
 * PreviewManager the server already owns.
 */
async function startTargetPreview(
  previews: PreviewManager,
  task: Task,
  target: string,
): Promise<{ url: string } | { error: string }> {
  await previews.stop(task.id);
  const started = await previews.start(task, target);
  if (!started.ok || !started.url) {
    return { error: started.error ?? "could not start the preview" };
  }
  return { url: started.url.replace(/\/$/, "") };
}

/**
 * Decide whether — and what — the automatic capture should shoot, without
 * touching a browser. Fail-soft: every reason to stand down is returned as a
 * string, never a throw.
 */
export function planAutoCapture(
  config: RepoOSConfig,
  task: Task,
): { entries: CaptureEntry[]; errors: string[]; skips: string[] } | { reason: string } {
  if (!task.branch) return { reason: "the task has no branch yet" };
  const existing = localShotStore(config, task.id).list();
  if (existing.length > 0) {
    return {
      reason:
        `${existing.length} shot${existing.length === 1 ? "" : "s"} already captured — ` +
        "an engineer-made capture pre-empts the automatic one",
    };
  }
  const context = computeTaskShotContext(config, task);
  const declared = parseShotPlan(task.body);
  // #0603 review round 2: declared shots resolve targets the way `repoos shot`
  // does — changed paths, then the task's area, then the default command — so
  // an explicit declaration is honored even when the diff matches no glob.
  // Without declarations the capture stays strict (scope 1): only targets the
  // diff's paths actually matched count as UI evidence.
  let targets: string[];
  if (declared.shots.length > 0) {
    const resolution = resolveShotTargets(config.preview, task.area, context.changedPaths);
    if (resolution.names.length === 0) {
      return {
        reason:
          `the declared shots could not resolve a preview target — ` +
          `${resolution.reason ?? "no target matched the diff or the task's area"}`,
      };
    }
    targets = resolution.names;
  } else {
    targets = context.detected;
    if (targets.length === 0) {
      return {
        reason: `the diff (${context.changedPaths.length} changed paths) touches no [[preview.paths]] globs — no UI change to capture`,
      };
    }
  }
  // #0603: the per-target match detail behind `detected` — which globs matched
  // (fallback captions) and which targets matched docs content only (no
  // inferable route → the capture needs a declared route or skips visibly).
  const matchedGlobs = new Map<string, string[]>();
  const docsContentOnly = new Set<string>();
  for (const match of describeTargetPathMatches(config.preview, context.changedPaths)) {
    matchedGlobs.set(match.target, match.globs);
    if (match.contentOnly) docsContentOnly.add(match.target);
  }
  const built = buildCapturePlan(targets, declared.shots, {
    matchedGlobs,
    docsContentOnly,
  });
  const errors = [...declared.errors, ...built.errors];
  const skips = [...built.autoSkips];
  if (built.entries.length === 0) {
    // Stand down, with a reason the drawer can show. A declaration exists but
    // produced nothing → its errors are the why; otherwise say plainly that
    // without declarations the capture does not shoot.
    if (declared.shots.length > 0 && errors.length > 0) {
      return {
        reason: `the declared shot list produced no captures: ${[...errors, ...skips].join("; ")}`,
      };
    }
    return {
      reason:
        skips.length > 0 ? skips.join("; ") : "no captures were planned for the resolved targets",
    };
  }
  return { entries: built.entries, errors, skips };
}

/**
 * Run the automatic capture for `task` and record the outcome. Never throws
 * and never fails a caller: returns a structured result, writes a task-log
 * line, and appends an activity note for every skip/failure (the drawer's
 * activity log is where a human or reviewer actually looks — a silent skip
 * would recreate exactly the #0582 problem of shots nobody knew were absent).
 */
export async function runAutoShotCapture(
  config: RepoOSConfig,
  task: Task,
  previews: PreviewManager,
  log: TaskLog,
): Promise<ShotCaptureResult> {
  const finish = (
    status: ShotCaptureResult["status"],
    detail: string,
    count?: number,
  ): ShotCaptureResult => {
    const message = status === "captured" ? `shots: ${detail}` : `shots: ${status} — ${detail}`;
    log(task.id, status === "captured" ? "info" : "warn", message);
    if (status !== "captured") {
      // Best-effort: the note is additive and commits fail-soft.
      try {
        patchTaskFile(config, task.absPath, { note: message });
      } catch {
        /* the log line already recorded it */
      }
    }
    inFlight.delete(task.id);
    return { status, detail: message, ...(count !== undefined ? { count } : {}) };
  };

  if (inFlight.has(task.id)) {
    return { status: "skipped", detail: "shots: skipped — a capture is already in flight" };
  }
  inFlight.add(task.id);

  const plan = planAutoCapture(config, task);
  if ("reason" in plan) {
    return finish("skipped", plan.reason);
  }
  const entries = plan.entries;
  // #0603: partial outcomes stay visible — a docs-content target that was
  // skipped beside a captured one, or a declared entry that errored, is a note
  // in the log + activity, not a silent drop of information.
  for (const skip of plan.skips) {
    log(task.id, "warn", `shots: skipped — ${skip}`);
  }
  for (const error of plan.errors) {
    log(task.id, "warn", `shots: declared list problem — ${error}`);
  }

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let currentTarget: string | undefined;
  let currentUrl = "";
  let captured = 0;
  try {
    try {
      browser = await launchWebkit();
      context = await browser.newContext({ serviceWorkers: "block" });
    } catch (err) {
      if (isShotCaptureUnavailable(err)) {
        return finish(
          "skipped",
          `Playwright/WebKit unavailable (${(err as Error).message.split("\n")[0]}). ${INSTALL_ADVICE}`,
        );
      }
      return finish(
        "failed",
        `could not launch the browser: ${(err as Error).message.split("\n")[0]}`,
      );
    }
    for (const entry of entries) {
      if (entry.target !== currentTarget) {
        const started = await startTargetPreview(previews, task, entry.target);
        if ("error" in started) {
          return finish(
            "failed",
            `preview for target "${entry.target}" did not start: ${started.error}`,
          );
        }
        currentUrl = started.url;
        currentTarget = entry.target;
      }
      const page = (await context.newPage()) as unknown as ShotDriverPage;
      const pageUrl = `${currentUrl}${entry.route.startsWith("/") ? entry.route : `/${entry.route}`}`;
      let png: Buffer;
      try {
        await page.setViewportSize(AUTO_VIEWPORT);
        png = await captureShotPage(page, pageUrl, entry, {
          waitMs: AUTO_SETTLE_MS,
          fullPage: false,
        });
      } catch (err) {
        await page.close().catch(() => {});
        return finish(
          "failed",
          `capture of ${entry.label ?? entry.route} on "${entry.target}" failed: ${(err as Error).message.split("\n")[0]}`,
        );
      }
      await page.close().catch(() => {});
      const stored = localShotStore(config, task.id).save({
        target: entry.target,
        route: entry.route,
        ...(entry.label ? { label: entry.label } : {}),
        provenance: provenanceCaption(entry.provenance),
        data: png.toString("base64"),
      });
      if ("error" in stored) {
        return finish("failed", `the shot store rejected the image: ${stored.error}`);
      }
      captured++;
    }
    return finish(
      "captured",
      `${captured} shot${captured === 1 ? "" : "s"} captured automatically ` +
        `(${entries.map((e) => `${e.target}${e.highlight ? " · highlighted" : ""}${e.label ? ` – ${e.label}` : ""}`).join(", ")})` +
        // #0603 review round 2: partial skips ride in the captured note too —
        // activity is where a reviewer actually looks, not the task log.
        (plan.skips.length > 0 ? `; skipped: ${plan.skips.join("; ")}` : ""),
      captured,
    );
  } finally {
    inFlight.delete(task.id);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    // The capture owns the preview it started: previews are on-demand only
    // (#0271), so leaving one running after a success OR a failure would hold
    // the single preview slot until the task leaves review.
    if (currentTarget !== undefined) await previews.stop(task.id).catch(() => {});
  }
}
