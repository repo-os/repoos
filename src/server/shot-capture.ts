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
import { shotCapturePageUrl } from "../core/shot-fixtures.js";
import {
  buildCapturePlan,
  parseShotPlan,
  provenanceCaption,
  shotPlanFingerprint,
  type CaptureEntry,
  type DeclaredShot,
} from "../core/shot-plan.js";
import type { ShotMeta } from "./shots.js";
import { describeTargetPathMatches, resolveShotTargets } from "../core/shot-targets.js";
import type { LogLevel } from "../core/logger.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { runGit, worktreePathForBranch } from "../core/git.js";
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

/** One page capture: the PNG plus any highlight/selector miss warnings. */
export interface CapturedPage {
  png: Buffer;
  /** e.g. `highlight .x matched nothing on /route` — the caller decides where these go. */
  warnings: string[];
}

/**
 * Capture ONE entry on a fresh page of `context`: viewport, the shared page
 * choreography (`captureShotPage`), miss warnings collected instead of noted.
 * The one piece of the old inline loop that both the handoff pass and the
 * single-entry Add-shot capture (#0627) run — extracting it keeps the two
 * paths in lockstep.
 */
export async function captureEntryPage(
  context: SmokeContext,
  pageUrl: string,
  entry: CaptureEntry,
  settleMs: number = AUTO_SETTLE_MS,
): Promise<CapturedPage> {
  const warnings: string[] = [];
  const page = (await context.newPage()) as unknown as ShotDriverPage;
  try {
    await page.setViewportSize(AUTO_VIEWPORT);
    const png = await captureShotPage(
      page,
      pageUrl,
      entry,
      { waitMs: settleMs, fullPage: false },
      {
        onHighlightMiss: (selector, route) => {
          warnings.push(`highlight ${selector} matched nothing on ${route}`);
        },
        onSelectorMiss: (selector, route) => {
          warnings.push(`selector ${selector} matched nothing on ${route}`);
        },
        onStepMiss: (message, route) => {
          warnings.push(`${message} on ${route}`);
        },
      },
    );
    return { png, warnings };
  } finally {
    await page.close().catch(() => {});
  }
}

/** In-flight captures, so duplicate review transitions never double-run. */
const inFlight = new Set<string>();

/**
 * The tested tree identity for a task (#0734): the short HEAD sha of its
 * worktree (resolved from the branch; the root when no worktree is linked).
 * Undefined when git is unavailable — callers then treat the tree as unknown
 * rather than failing.
 */
async function headIdentity(config: RepoOSConfig, task: Task): Promise<string | undefined> {
  const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
  const dir = worktree ?? config.root;
  const res = await runGit(dir, ["rev-parse", "--short", "HEAD"], 10_000);
  if (res.status !== 0) return undefined;
  const sha = res.stdout.trim();
  return sha || undefined;
}

/**
 * One preview per task, so each new target must replace the running one
 * (#0379/#0271) — mirrored from the CLI capture path, here via the
 * PreviewManager the server already owns.
 *
 * A `noEvict` caller (the manual single-entry capture) must never stop a
 * preview: one may have registered after its own snapshot check — the human
 * clicked Preview while WebKit was launching — and stopping here would evict
 * exactly the preview someone is viewing, defeating the manager's no-evict
 * refusal (review round 2). `start` is idempotent for a same-task preview and
 * refuses (noEvict) instead of evicting others, so the capacity decision stays
 * atomic with the start; the `reused` flag tells the caller which previews are
 * not its own to stop.
 */
async function startTargetPreview(
  previews: PreviewManager,
  task: Task,
  target: string,
  opts: { noEvict?: boolean } = {},
): Promise<{ url: string; label?: string; reused: boolean } | { error: string; busy?: boolean }> {
  const noEvict = opts.noEvict === true;
  if (!noEvict) await previews.stop(task.id);
  const before = noEvict ? previews.get(task.id) : null;
  const started = await previews.start(task, target, noEvict ? { noEvict: true } : {});
  if (!started.ok || !started.url) {
    // A same-task preview that registered between the caller's snapshot and
    // this start makes start refuse (target mismatch) — for a manual capture
    // that is a busy situation, not a generic failure.
    const raced = noEvict ? previews.get(task.id) : null;
    return {
      error: started.error ?? "could not start the preview",
      ...(started.busy || raced ? { busy: true } : {}),
    };
  }
  return {
    url: started.url.replace(/\/$/, ""),
    ...(started.label ? { label: started.label } : {}),
    reused: noEvict && before !== null,
  };
}

/**
 * Decide whether — and what — the automatic capture should shoot, without
 * touching a browser. Fail-soft: every reason to stand down is returned as a
 * string, never a throw.
 */
export function planAutoCapture(
  config: RepoOSConfig,
  task: Task,
):
  | { entries: CaptureEntry[]; errors: string[]; skips: string[]; collapsed: string[] }
  | { reason: string } {
  if (!task.branch) return { reason: "the task has no branch yet" };
  // Only engineer-made shots pre-empt. A shot the server's own capture wrote is
  // replaced on re-handoff: otherwise a first capture taken from a stale or
  // malformed declaration (a blind `/` fallback, #0625) blocks the corrected one.
  const existing = localShotStore(config, task.id)
    .list()
    .filter((shot) => shot.origin !== "auto");
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
  return { entries: built.entries, errors, skips, collapsed: built.collapsed };
}

/**
 * Which prior automatic captures may be reused for the current plan/tree
 * (#0734). Reusable means the shot records the SAME plan fingerprint and the
 * SAME tested tree (when a tree identity is known). A shot with no recorded
 * fingerprint predates #0734 and is never reusable — it cannot be tied to the
 * current plan. Exported so the reuse rule is unit-testable without a browser.
 */
export function reusableAutoCaptures(
  shots: ShotMeta[],
  planFingerprint: string,
  sourceIdentity: string | undefined,
): ShotMeta[] {
  return shots.filter(
    (shot) =>
      shot.planFingerprint !== undefined &&
      shot.planFingerprint === planFingerprint &&
      (sourceIdentity === undefined || shot.sourceIdentity === sourceIdentity),
  );
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
  // #0734: reuse an existing automatic capture ONLY when it is bound to the
  // SAME plan and the SAME tested tree. A metadata note alone must not stand
  // down a capture whose declaration changed (a corrected route, a new
  // assertion) or whose source tree moved on — that was the stale-capture
  // failure of #0720/#0727. A capture with no recorded fingerprint (taken
  // before #0734) is NOT reusable: it cannot be tied to the current plan.
  const planFingerprint = shotPlanFingerprint(plan.entries);
  const sourceIdentity = await headIdentity(config, task);
  const autoExisting = localShotStore(config, task.id)
    .list()
    .filter((shot) => shot.origin === "auto");
  const reusable = reusableAutoCaptures(autoExisting, planFingerprint, sourceIdentity);
  if (autoExisting.length > 0 && reusable.length === autoExisting.length) {
    return finish(
      "skipped",
      `${autoExisting.length} handoff shot${autoExisting.length === 1 ? "" : "s"} already captured ` +
        `for this exact plan (${sourceIdentity ?? "unknown tree"}) during finalization (#0734)`,
    );
  }
  if (autoExisting.length > 0 && reusable.length < autoExisting.length) {
    log(
      task.id,
      "info",
      `shots: ${autoExisting.length - reusable.length} prior handoff capture(s) do not match the ` +
        `current plan/tree — recapturing`,
    );
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
  if (plan.collapsed.length > 0) {
    log(
      task.id,
      "warn",
      `shots: collapsed ${plan.collapsed.length} near-duplicate declaration(s) into one capture`,
    );
  }

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let currentTarget: string | undefined;
  let currentUrl = "";
  let captured = 0;
  let cleared = false;
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
      const pageUrl = shotCapturePageUrl(currentUrl, entry);
      let png: Buffer;
      let warnings: string[] = [];
      try {
        ({ png, warnings } = await captureEntryPage(context, pageUrl, entry));
      } catch (err) {
        return finish(
          "failed",
          `capture of ${entry.label ?? entry.route} on "${entry.target}" failed: ${(err as Error).message.split("\n")[0]}`,
        );
      }
      // The miss callbacks only collect here; noting them on the task keeps the
      // pre-extraction behavior (log line + activity note) for the handoff pass.
      for (const msg of warnings) {
        log(task.id, "warn", `shots: ${msg}`);
        try {
          patchTaskFile(config, task.absPath, { note: msg });
        } catch {
          /* the log line already recorded it */
        }
      }
      const store = localShotStore(config, task.id);
      // Drop the previous automatic capture only once a replacement exists.
      if (!cleared) {
        store.removeAuto();
        cleared = true;
      }
      const stored = store.save({
        origin: "auto",
        target: entry.target,
        route: entry.route,
        ...(entry.label ? { label: entry.label } : {}),
        provenance: provenanceCaption(entry.provenance),
        // #0734: bind the capture to the plan and the tested tree so a later
        // handoff can tell whether it may reuse this evidence.
        planFingerprint,
        ...(sourceIdentity ? { sourceIdentity } : {}),
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

/** One-shot capture result for the task drawer's Add-shot action (#0627). */
export type DeclaredShotCapture =
  | { shot: ShotMeta; warnings: string[] }
  | {
      error: string;
      /** True when the one-preview cap is the reason — the UI can say so. */ busy?: boolean;
      /** True when Playwright/WebKit is missing — the error carries the install advice. */ unavailable?: boolean;
    };

/**
 * Capture ONE declared entry outside the handoff flow (#0627): start or reuse
 * a preview for the entry's target, run the same page choreography
 * (`captureEntryPage`), and store the PNG as a DECLARED shot — no
 * `origin: "auto"`, so the next handoff's cleanup never deletes it and the
 * automatic pass still stands down (it only counts non-auto shots as
 * engineer-made).
 *
 * Busy semantics differ from the automatic pass on purpose: `startTargetPreview`
 * replaces whatever preview runs for the task, which is right at handoff but
 * wrong for a manual capture — a human may be looking at that preview right
 * now. The one-preview cap is therefore answered with a structured busy error
 * when ANY preview is running for another task, and when the task's own
 * preview is running a DIFFERENT target; the same target's live preview is
 * reused (no restart, no churn — the CLI rule). The snapshot checks below are
 * fast-fails with precise messages; the authoritative reservation passes
 * `noEvict` to `PreviewManager.start`, so the capacity decision is made
 * atomically with the start and a preview that starts in between can never be
 * evicted by this capture — it is reused only when it provably serves the
 * requested target, and otherwise answered with busy while it keeps running
 * (review round 2).
 *
 * Returns a structured error (never throws) for: busy preview slot,
 * Playwright/WebKit unavailable, a preview that would not boot, or a failed
 * page capture (e.g. the declared route did not load). The caller appends the
 * `## Shots` declaration only AFTER a successful capture, so a failed capture
 * never leaves a declared-but-never-captured entry behind.
 */
export async function captureDeclaredShot(
  config: RepoOSConfig,
  task: Task,
  previews: PreviewManager,
  entry: CaptureEntry & {
    /** The parsed declaration to store on the shot, for exact delete sync (#0627). */
    declared?: DeclaredShot;
  },
): Promise<DeclaredShotCapture> {
  // One preview at a time (#0271) — but a manual capture never evicts what a
  // human is viewing; that slot is BUSY, not available. A same-task preview
  // whose target cannot be identified (no label — a legacy registry record)
  // is busy too: reusing it for any requested target could shoot the wrong
  // one (review round 2).
  const running = previews.runningPreviews();
  const own = running.find((r) => r.taskId === task.id);
  if (own && (!own.info.label || own.info.label !== entry.target)) {
    return {
      error: own.info.label
        ? `a "${own.info.label}" preview is already running for this task — ` +
          `stop it before capturing "${entry.target}"`
        : `a preview is already running for this task, but its target could not be ` +
          `identified — stop it before capturing "${entry.target}"`,
      busy: true,
    };
  }
  const other = running.find((r) => r.taskId !== task.id);
  if (other && !own) {
    return {
      error:
        `the one preview slot is busy: task #${other.taskId} has a preview running — ` +
        "stop it (or wait for it to be evicted), then retry",
      busy: true,
    };
  }

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let startedPreviewForTask = false;
  let url = own?.info.url.replace(/\/$/, "");
  try {
    try {
      browser = await launchWebkit();
      context = await browser.newContext({ serviceWorkers: "block" });
    } catch (err) {
      if (isShotCaptureUnavailable(err)) {
        return {
          error: `Playwright/WebKit unavailable (${(err as Error).message.split("\n")[0]}). ${INSTALL_ADVICE}`,
          unavailable: true,
        };
      }
      return { error: `could not launch the browser: ${(err as Error).message.split("\n")[0]}` };
    }
    if (!url) {
      // The busy decision is made inside `start` (noEvict), atomically with the
      // start — a snapshot check here alone would race another preview starting
      // in between and evict the one being viewed (review round 1).
      const startedPreview = await startTargetPreview(previews, task, entry.target, {
        noEvict: true,
      });
      if ("error" in startedPreview) {
        return {
          error: `preview for target "${entry.target}" did not start: ${startedPreview.error}`,
          ...(startedPreview.busy ? { busy: true } : {}),
        };
      }
      if (
        startedPreview.reused &&
        (!startedPreview.label || startedPreview.label !== entry.target)
      ) {
        // A preview registered between the snapshot above and this start (the
        // human clicked Preview while WebKit was launching): reuse it only when
        // it provably serves the requested target, and never stop it.
        return {
          error: startedPreview.label
            ? `a "${startedPreview.label}" preview started for this task while the ` +
              `capture was preparing — stop it before capturing "${entry.target}"`
            : `a preview started for this task while the capture was preparing, but its ` +
              `target could not be identified — stop it before capturing "${entry.target}"`,
          busy: true,
        };
      }
      url = startedPreview.url;
      startedPreviewForTask = !startedPreview.reused;
    }
    const pageUrl = shotCapturePageUrl(url, entry);
    let captured: CapturedPage;
    try {
      captured = await captureEntryPage(context, pageUrl, entry);
    } catch (err) {
      return {
        error: `capture failed: the route may not load — ${(err as Error).message.split("\n")[0]}`,
      };
    }
    const provenance = provenanceCaption(entry.provenance);
    const stored = localShotStore(config, task.id).save({
      target: entry.target,
      route: entry.route,
      ...(entry.label ? { label: entry.label } : {}),
      provenance,
      // Deliberately NOT `origin: "auto"` (#0627): a hand-added shot is
      // engineer-made evidence, so re-handoff cleanup keeps it and the
      // automatic capture still pre-empts correctly.
      // The full parsed declaration rides in the manifest so delete can sync
      // THE exact `## Shots` entry — selector and steps included (#0627
      // review round 1); the shallow label/route/target fields alone cannot
      // distinguish two declarations that differ only there.
      ...(entry.declared ? { declared: entry.declared } : {}),
      data: captured.png.toString("base64"),
    });
    if ("error" in stored) {
      return { error: `the shot store rejected the image: ${stored.error}` };
    }
    return { shot: stored, warnings: captured.warnings };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    // Only a preview THIS capture started gets stopped: a reused running
    // preview is exactly the one a human may be viewing.
    if (startedPreviewForTask) await previews.stop(task.id).catch(() => {});
  }
}
