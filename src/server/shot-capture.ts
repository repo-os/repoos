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
import { basename, extname, join } from "node:path";
import { rmSync, readFileSync, existsSync } from "node:fs";
import {
  buildCapturePlan,
  parseShotPlan,
  provenanceCaption,
  shotPlanFingerprint,
  taskFixtureValidator,
  type CaptureEntry,
  type DeclaredShot,
} from "../core/shot-plan.js";
import type { ShotMeta } from "./shots.js";
import {
  describeShotTargetPathMatches,
  describeTargetPathMatches,
  appPreviewTargetName,
  resolveShotTargets,
  shotTargetByName,
} from "../core/shot-targets.js";
import type { LogLevel } from "../core/logger.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import type { RepoOSConfig, ShotTargetConfig, Task } from "../core/types.js";
import { DEFAULT_MAX_AUTO_SHOTS } from "../core/types.js";
import { runGit, worktreePathForBranch } from "../core/git.js";
import { isEvidenceCurrent } from "./evidence-current.js";
import { runShotCommand, slugName } from "../core/shot-command.js";
import { isShotCaptureUnavailable } from "../commands/shot.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "../commands/ui-harness.js";
import type { PreviewManager } from "./preview.js";
import { computeTaskShotContext } from "./shot-context.js";
import { importShotArtifacts, localShotStore, shotsDir, type ShotStore } from "./shots.js";
import { patchTaskFile } from "./write.js";
import {
  BrowserEvidenceUnavailableError,
  recordBrowserCaptureActivity,
  runBrowserCaptureWithPolicy,
  type BrowserEvidenceArtifacts,
  type BrowserEvidenceTransport,
} from "./browser-capture-policy.js";
import { canonicalCaptureContext, type CanonicalCapturePlan } from "../core/remote-capture.js";

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
  /**
   * #0866: warnings that mean the captured PNG is the WRONG SCREEN (a state
   * fixture that never rendered, a target that served its HTML shell for an
   * app module). Declared shots must not be saved as evidence on these.
   */
  blockingWarnings: string[];
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
  entry: CaptureEntry & { route: string },
  settleMs: number = AUTO_SETTLE_MS,
): Promise<CapturedPage> {
  const warnings: string[] = [];
  const blockingWarnings: string[] = [];
  const page = (await context.newPage()) as unknown as ShotDriverPage;
  try {
    const width = entry.viewportWidth ?? AUTO_VIEWPORT.width;
    await page.setViewportSize({ width, height: AUTO_VIEWPORT.height });
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
        // #0755: a loading-state capture is reported like a failed step.
        onLoadingState: (message, route) => {
          warnings.push(`${message} on ${route}`);
        },
        // #0782: a declared theme the driver could not set — the frame would
        // show the wrong theme, so say so instead of passing silently.
        onThemeMiss: (theme, route) => {
          warnings.push(`theme ${theme} could not be applied on ${route}`);
        },
        // #0866: a state fixture that never rendered, or a target that served
        // its HTML shell instead of the app, is the wrong screen — reported as
        // a failed shot with the target named.
        onStateMiss: (message) => {
          warnings.push(message);
          blockingWarnings.push(message);
        },
        onRouteNotServed: (message) => {
          warnings.push(message);
          blockingWarnings.push(message);
        },
      },
    );
    return { png, warnings, blockingWarnings };
  } finally {
    await page.close().catch(() => {});
  }
}

/** In-flight captures, so duplicate review transitions never double-run. */
const inFlight = new Set<string>();

/** Shared task-level reservation for local and runner browser evidence jobs. */
export function reserveBrowserCapture(taskId: string): boolean {
  if (inFlight.has(taskId)) return false;
  inFlight.add(taskId);
  return true;
}

export function releaseBrowserCapture(taskId: string): void {
  inFlight.delete(taskId);
}

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
  opts: { forceRefresh?: boolean } = {},
):
  | {
      entries: CaptureEntry[];
      errors: string[];
      /** #0866: declared shots that cannot render on their resolved target. */
      blockingErrors?: string[];
      skips: string[];
      collapsed: string[];
    }
  | { reason: string; blockingErrors?: string[] } {
  if (!task.branch) return { reason: "the task has no branch yet" };
  // Only engineer-made shots pre-empt. A shot the server's own capture wrote is
  // replaced on re-handoff: otherwise a first capture taken from a stale or
  // malformed declaration (a blind `/` fallback, #0625) blocks the corrected one.
  const existing = localShotStore(config, task.id)
    .list()
    .filter((shot) => shot.origin !== "auto");
  const refreshExistingPlan = ():
    | {
        entries: CaptureEntry[];
        errors: string[];
        blockingErrors: string[];
        skips: string[];
        collapsed: string[];
      }
    | undefined => {
    if (!opts.forceRefresh || existing.length === 0) return undefined;
    const available = new Set([
      ...(config.preview?.targets ?? []).map((target) => target.name),
      ...(config.shot?.targets ?? []).map((target) => target.name),
      ...(config.preview?.command?.trim() ? ["default"] : []),
    ]);
    const entries = existing
      .filter((shot) => shot.target !== "unknown" && available.has(shot.target))
      .map((shot): CaptureEntry => ({
        target: shot.target,
        ...(shot.command === "command" ? {} : { route: shot.route ?? "/" }),
        ...(shot.declared?.selector ? { selector: shot.declared.selector } : {}),
        ...(shot.declared?.highlight ? { highlight: shot.declared.highlight } : {}),
        ...(shot.declared?.steps ? { steps: shot.declared.steps } : {}),
        ...(shot.declared?.assert ? { assert: shot.declared.assert } : {}),
        ...(shot.label ? { label: shot.label } : {}),
        provenance: { kind: "declared", ...(shot.label ? { label: shot.label } : {}) },
      }));
    return entries.length > 0
      ? { entries, errors: [], blockingErrors: [], skips: [], collapsed: [] }
      : undefined;
  };
  if (existing.length > 0 && !opts.forceRefresh) {
    return {
      reason:
        `${existing.length} shot${existing.length === 1 ? "" : "s"} already captured — ` +
        "an engineer-made capture pre-empts the automatic one",
    };
  }
  const context = computeTaskShotContext(config, task);
  // Read fixtures from the task branch if available (#0786).
  const fixtureValidator = taskFixtureValidator(
    (path: string) => {
      try {
        return existsSync(path) ? readFileSync(path, "utf8") : null;
      } catch {
        return null;
      }
    },
    config,
    task,
  );
  const declared = parseShotPlan(task.body, fixtureValidator ? { fixtureValidator } : undefined);
  // #0603 review round 2: declared shots resolve targets the way `repoos shot`
  // does — changed paths, then the task's area, then the default command — so
  // an explicit declaration is honored even when the diff matches no glob.
  // Without declarations the capture stays strict (scope 1): only targets the
  // diff's paths actually matched count as UI evidence.
  let targets: string[];
  if (declared.shots.length > 0) {
    const resolution = resolveShotTargets(
      config.preview,
      task.area,
      context.changedPaths,
      undefined,
      config.shot,
    );
    if (resolution.names.length === 0) {
      const previousPlan = refreshExistingPlan();
      if (previousPlan) return previousPlan;
      return {
        reason:
          `the declared shots could not resolve a capture target — ` +
          `${resolution.reason ?? "no target matched the diff or the task's area"}`,
      };
    }
    targets = resolution.names;
    // A declaration that explicitly names `default` means the main RepoOS app,
    // even when docs changes also resolve the Docs site target. Keep the
    // default command in the candidate list so the declaration cannot alias to
    // the sole path match.
    if (
      declared.shots.some((shot) => shot.target === "default") &&
      config.preview?.command?.trim()
    ) {
      targets = [...new Set([...targets, "default"])];
    }
  } else {
    targets = context.detected;
    if (targets.length === 0) {
      const previousPlan = refreshExistingPlan();
      if (previousPlan) return previousPlan;
      return {
        reason: `the diff (${context.changedPaths.length} changed paths) touches no capture target's globs — no UI change to capture`,
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
  for (const match of describeShotTargetPathMatches(config.shot, context.changedPaths)) {
    matchedGlobs.set(match.target, match.globs);
    if (match.contentOnly) docsContentOnly.add(match.target);
  }
  const commandTargets = new Set((config.shot?.targets ?? []).map((t) => t.name));
  const appTarget = appPreviewTargetName(config.preview);
  const built = buildCapturePlan(targets, declared.shots, {
    matchedGlobs,
    docsContentOnly,
    commandTargets,
    // #0866: declared state fixtures / app routes belong to the app target,
    // even when the diff's path resolution listed another target first.
    ...(appTarget ? { appTarget } : {}),
  });
  const errors = [...declared.errors, ...built.errors];
  const blockingErrors = [...built.blockingErrors];
  const skips = [...built.autoSkips];
  if (built.entries.length === 0) {
    // Stand down, with a reason the drawer can show. A declaration exists but
    // produced nothing → its errors are the why; otherwise say plainly that
    // without declarations the capture does not shoot.
    if (declared.shots.length > 0 && errors.length > 0) {
      return {
        reason: `the declared shot list produced no captures: ${[...errors, ...skips].join("; ")}`,
        ...(blockingErrors.length ? { blockingErrors } : {}),
      };
    }
    return {
      reason:
        skips.length > 0 ? skips.join("; ") : "no captures were planned for the resolved targets",
    };
  }
  return { entries: built.entries, errors, blockingErrors, skips, collapsed: built.collapsed };
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
  currentSourceIdentities: ReadonlySet<string> = new Set(),
): ShotMeta[] {
  return shots.filter(
    (shot) =>
      shot.planFingerprint !== undefined &&
      shot.planFingerprint === planFingerprint &&
      sourceIdentity !== undefined &&
      (shot.sourceIdentity === sourceIdentity ||
        (shot.sourceIdentity !== undefined && currentSourceIdentities.has(shot.sourceIdentity))),
  );
}

/** One image a command target produced, as recorded in handoff evidence (#0765). */
export interface CommandCaptureShot {
  name: string;
  size: number;
  mime: string;
  /** Repo-relative path in the main checkout, where the reviewer looks. */
  path: string;
  url: string;
}

/**
 * Provenance for one command-target capture (#0765). A command target has no
 * page and no browser console, so its evidence records what actually happened
 * instead: the target, the command and cwd it ran in, its exit status, the tail
 * of its stdout/stderr, and the image files it produced (with sizes). This is
 * the command-target counterpart of a web capture's `UiHandoffGateCapture`.
 */
export interface CommandCaptureEvidence {
  target: string;
  label?: string;
  /** The configured command that rendered the images. */
  command: string;
  /** Absolute directory the command ran in (the worktree, or the target's `cwd`). */
  cwd: string;
  status: "captured" | "skipped" | "failed";
  /** Process exit status; null when the command never ran / was killed. */
  exitStatus: number | null;
  /** Why the command was skipped or failed (absent when captured). */
  reason?: string;
  /** Non-blocking warnings (e.g. a non-zero exit that still produced images). */
  warnings?: string[];
  /** Tail of stdout+stderr, for provenance. */
  outputTail?: string;
  /** Images collected and stored, with sizes. */
  shots: CommandCaptureShot[];
}

export interface CommandCaptureBatch {
  captured: number;
  evidence: CommandCaptureEvidence[];
  /** A configured-target lookup that failed — the caller decides whether to abort. */
  fatal?: string;
  /** The shot store rejected an image. */
  storeError?: string;
}

/**
 * Run every command-target capture entry, store the images it produced, and
 * return the provenance records (#0765). Shared by the handoff gate (which
 * writes the evidence file synchronously before review) and the automatic
 * capture (#0594), so the two paths stay in lockstep. Pure of logging and
 * abort policy: it never throws, and the caller decides what a skip/failure
 * means. `ensureCleared` lets the caller drop prior automatic captures exactly
 * once, just before the first new image is stored.
 */
export function captureCommandEntries(input: {
  config: RepoOSConfig;
  task: Task;
  entries: CaptureEntry[];
  commandRoot: string;
  planFingerprint: string;
  sourceIdentity?: string;
  store: ShotStore;
  ensureCleared: () => void;
  /** On an explicit refresh, drop prior shots when a command entry is skipped. */
  clearPriorOnCommandSkip?: boolean;
}): CommandCaptureBatch {
  const {
    config,
    task,
    entries,
    commandRoot,
    planFingerprint,
    sourceIdentity,
    store,
    ensureCleared,
    clearPriorOnCommandSkip = false,
  } = input;
  const evidence: CommandCaptureEvidence[] = [];
  let captured = 0;
  for (const entry of entries) {
    const target = shotTargetByName(config.shot, entry.target);
    if (!target) {
      return {
        captured,
        evidence,
        fatal: `command capture target "${entry.target}" is not configured`,
      };
    }
    const outputDir = join(
      shotsDir(config.root, config.workDir, task.id),
      "cmd",
      slugName(entry.target),
    );
    // #0769: a declared entry can pass env/args to the command and narrow the
    // collected files with its own glob; both are pure selection, never
    // interpolated into the command string.
    const outcome = runShotCommand(target, commandRoot, outputDir, {
      ...(entry.env ? { env: entry.env } : {}),
      ...(entry.args ? { args: entry.args } : {}),
      ...(entry.glob ? { outputGlob: [entry.glob] } : {}),
    });
    const base = {
      target: entry.target,
      ...(entry.label ? { label: entry.label } : {}),
      command: target.command,
      cwd: target.cwd ? join(commandRoot, target.cwd) : commandRoot,
      exitStatus: outcome.exitStatus,
      ...(outcome.outputTail ? { outputTail: outcome.outputTail } : {}),
    };
    if (outcome.status !== "captured") {
      // A command problem is a VISIBLE skip/failure note — never a failed
      // handoff. The reason already carries the stdout/stderr tail.
      if (clearPriorOnCommandSkip) ensureCleared();
      evidence.push({ ...base, status: outcome.status, reason: outcome.reason, shots: [] });
      continue;
    }
    ensureCleared();
    // #0769: an UNDECLARED automatic capture is capped. A command's whole
    // output set can be dozens of unrelated snapshots; keeping only the first
    // `maxAutoShots` avoids flooding the Changes tab, and the drop is recorded
    // as a visible "N more not shown" note rather than silently. Declared
    // entries are never capped — the engineer asked for exactly those images.
    const cap =
      entry.provenance.kind === "auto"
        ? (config.shot?.maxAutoShots ?? DEFAULT_MAX_AUTO_SHOTS)
        : undefined;
    const selected =
      cap !== undefined && outcome.files.length > cap ? outcome.files.slice(0, cap) : outcome.files;
    const notShown = outcome.files.length - selected.length;
    const warnings = [...outcome.warnings];
    if (notShown > 0) {
      warnings.push(
        `${notShown} more image${notShown === 1 ? "" : "s"} not shown (cap ${cap} per task) — ` +
          "declare a `## Shots` entry with a `glob` to capture a specific one",
      );
    }
    const shots: CommandCaptureShot[] = [];
    let storeError: string | undefined;
    for (const file of selected) {
      const stored = store.save({
        origin: "auto",
        target: entry.target,
        command: "command",
        ...(entry.label ? { label: entry.label } : {}),
        provenance: provenanceCaption(entry.provenance),
        planFingerprint,
        ...(sourceIdentity ? { sourceIdentity } : {}),
        name: `${entry.target}-${basename(file.name, extname(file.name))}`,
        mime: file.mime,
        data: file.data.toString("base64"),
      });
      if ("error" in stored) {
        storeError = stored.error;
        break;
      }
      captured++;
      shots.push({
        name: stored.name,
        size: stored.size,
        mime: stored.mime,
        path: stored.path,
        url: stored.url,
      });
    }
    // The raw command output is transient — the store now owns the bytes.
    try {
      rmSync(outputDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    evidence.push({
      ...base,
      status: "captured",
      ...(warnings.length ? { warnings } : {}),
      shots,
    });
    if (storeError) return { captured, evidence, storeError };
  }
  return { captured, evidence };
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
  remoteTransport?: BrowserEvidenceTransport,
  /** The control plane's resolved plan; the runner executes it instead of re-planning (#0854). */
  canonicalPlan?: CanonicalCapturePlan,
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
    releaseBrowserCapture(task.id);
    return { status, detail: message, ...(count !== undefined ? { count } : {}) };
  };

  if (!reserveBrowserCapture(task.id)) {
    return { status: "skipped", detail: "shots: skipped — a capture is already in flight" };
  }
  if (
    config.remoteValidation?.browserCaptureMode &&
    config.remoteValidation.browserCaptureMode !== "local"
  ) {
    try {
      // Resolve the plan HERE, against the canonical board body and the live
      // config, and send it to the runner. The runner's bundled branch can lag
      // the board (a `## Shots` edit after branch creation) and its detached
      // checkout cannot re-diff changed paths, so a runner-planned capture could
      // differ from — or skip — what local capture would produce (#0854).
      const remotePlan = planAutoCapture(config, task);
      if ("reason" in remotePlan) return finish("skipped", remotePlan.reason);
      if (remotePlan.blockingErrors?.length) {
        return finish(
          "failed",
          `declared shot cannot render — ${remotePlan.blockingErrors.join("; ")}`,
        );
      }
      const canonical = canonicalCaptureContext(config, task, remotePlan);
      const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
      const head = worktree ? await runGit(worktree, ["rev-parse", "HEAD"], 10_000) : null;
      const request =
        worktree && head?.status === 0 && task.branch
          ? {
              taskId: task.id,
              worktreePath: worktree,
              branch: task.branch,
              candidateSha: head.stdout.trim(),
              operation: "shots" as const,
              canonical,
            }
          : null;
      return await runBrowserCaptureWithPolicy({
        config,
        request: request ?? {
          taskId: task.id,
          worktreePath: config.root,
          branch: task.branch ?? "",
          candidateSha: "",
          operation: "shots",
          canonical,
        },
        transport: request ? remoteTransport : undefined,
        local: async () => {
          releaseBrowserCapture(task.id);
          const localConfig = {
            ...config,
            remoteValidation: { ...config.remoteValidation, browserCaptureMode: "local" as const },
          };
          return runAutoShotCapture(localConfig, task, previews, log);
        },
        note: (message) => log(task.id, "warn", `shots: ${message}`),
        useArtifacts: async (artifacts) => importRemoteShots(config, task, artifacts, log),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return finish("failed", detail);
    } finally {
      releaseBrowserCapture(task.id);
    }
  }

  // The runner (mode forced local) passes the control plane's plan so it
  // executes exactly what the board would; every other caller plans locally.
  const planned: ReturnType<typeof planAutoCapture> = canonicalPlan
    ? { ...canonicalPlan, blockingErrors: canonicalPlan.blockingErrors ?? [] }
    : planAutoCapture(config, task);
  if ("reason" in planned) {
    return finish("skipped", planned.reason);
  }
  // #0866: a declaration the resolved target cannot render must never be
  // captured as evidence — the same failure the handoff gate reports, raised
  // here too so a wrong-screen PNG cannot land even when UI verification is
  // disabled. This also covers a remote canonical plan.
  if (planned.blockingErrors?.length) {
    return finish("failed", `declared shot cannot render — ${planned.blockingErrors.join("; ")}`);
  }
  const plan = planned;
  // Branch fixtures (#0786): URL building admits a `state` the task branch's
  // source declares, even before main's compiled list knows it.
  const branchValidator = taskFixtureValidator(
    (path: string) => {
      try {
        return existsSync(path) ? readFileSync(path, "utf8") : null;
      } catch {
        return null;
      }
    },
    config,
    task,
  );
  const commandTargets = new Set((config.shot?.targets ?? []).map((t) => t.name));
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
  const currentCaptureIdentities = new Set<string>();
  if (sourceIdentity) {
    const worktree = task.branch
      ? (worktreePathForBranch(config.root, task.branch) ?? config.root)
      : config.root;
    for (const shot of autoExisting) {
      if (
        shot.sourceIdentity &&
        shot.sourceIdentity !== sourceIdentity &&
        (await isEvidenceCurrent(worktree, shot.sourceIdentity, sourceIdentity, config))
      ) {
        currentCaptureIdentities.add(shot.sourceIdentity);
      }
    }
  }
  const reusable = reusableAutoCaptures(
    autoExisting,
    planFingerprint,
    sourceIdentity,
    currentCaptureIdentities,
  );
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

  // Split the plan: web entries go through the browser/preview path; command
  // entries (#0761) run their target command in the worktree. Playwright is only
  // required when there IS a web entry, so a native-app repo needs no browser.
  const webEntries = entries.filter(
    (e): e is CaptureEntry & { route: string } => !commandTargets.has(e.target),
  );
  const commandEntries = entries.filter((e) => commandTargets.has(e.target));
  const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
  const commandRoot = worktree ?? config.root;

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let currentTarget: string | undefined;
  let currentUrl = "";
  let captured = 0;
  let cleared = false;
  try {
    if (webEntries.length > 0) {
      try {
        browser = await launchWebkit({
          repoRoot: config.root,
          onQueueLine: (line) => log(task.id, "info", line),
        });
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
    }
    for (const entry of webEntries) {
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
      const pageUrl = shotCapturePageUrl(currentUrl, entry, branchValidator ?? undefined);
      let png: Buffer;
      let warnings: string[] = [];
      let blockingWarnings: string[] = [];
      try {
        ({ png, warnings, blockingWarnings } = await captureEntryPage(
          context as SmokeContext,
          pageUrl,
          entry,
        ));
      } catch (err) {
        return finish(
          "failed",
          `capture of ${entry.label ?? entry.route} on "${entry.target}" failed: ${(err as Error).message.split("\n")[0]}`,
        );
      }
      // #0866: a declared shot that rendered the wrong screen is FAILED
      // evidence — never saved, and reported in the same words the handoff
      // gate uses. Non-declared captures keep the lenient warning behaviour.
      if (entry.provenance.kind === "declared" && blockingWarnings.length > 0) {
        const detail = `declared shot ${
          entry.label ?? entry.route
        } on target "${entry.target}" cannot render: ${blockingWarnings.join("; ")}`;
        for (const msg of blockingWarnings) log(task.id, "error", `shots: ${msg}`);
        try {
          patchTaskFile(config, task.absPath, { note: detail });
        } catch {
          /* the log line already recorded it */
        }
        return finish("failed", detail);
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
        ...(entry.route ? { route: entry.route } : {}),
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
    if (commandEntries.length > 0) {
      const batch = captureCommandEntries({
        config,
        task,
        entries: commandEntries,
        commandRoot,
        planFingerprint,
        sourceIdentity,
        store: localShotStore(config, task.id),
        ensureCleared: () => {
          if (!cleared) {
            localShotStore(config, task.id).removeAuto();
            cleared = true;
          }
        },
      });
      if (batch.fatal) return finish("failed", batch.fatal);
      captured += batch.captured;
      for (const ev of batch.evidence) {
        if (ev.status !== "captured") {
          // A command problem is a VISIBLE skip/failure note — never a failed
          // handoff. The reason already carries the stdout/stderr tail.
          const message = `shots: ${ev.status} — ${ev.reason ?? "capture failed"}`;
          log(task.id, "warn", message);
          try {
            patchTaskFile(config, task.absPath, { note: message });
          } catch {
            /* the log line already recorded it */
          }
          continue;
        }
        for (const msg of ev.warnings ?? []) {
          log(task.id, "warn", `shots: ${msg}`);
          try {
            patchTaskFile(config, task.absPath, { note: msg });
          } catch {
            /* the log line already recorded it */
          }
        }
      }
      if (batch.storeError) {
        return finish("failed", `the shot store rejected the image: ${batch.storeError}`);
      }
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
    releaseBrowserCapture(task.id);
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    // The capture owns the preview it started: previews are on-demand only
    // (#0271), so leaving one running after a success OR a failure would hold
    // the single preview slot until the task leaves review.
    if (currentTarget !== undefined) await previews.stop(task.id).catch(() => {});
  }
}

export async function importRemoteShots(
  config: RepoOSConfig,
  task: Task,
  artifacts: BrowserEvidenceArtifacts,
  log: TaskLog,
): Promise<ShotCaptureResult> {
  const remoteResult = artifacts.results.shots as ShotCaptureResult | undefined;
  if (!remoteResult || !["captured", "skipped", "failed"].includes(remoteResult.status)) {
    throw new Error("runner result omitted the shot capture outcome");
  }
  // Import whatever the runner actually produced, even from a PARTIAL run: the
  // runner saves each shot as it goes, so when a later entry fails the earlier
  // PNGs are still in the bundle and are real evidence (#0854 pass 17). Local
  // capture behaves the same way — it keeps the shots saved before the failure.
  // A successful run's artifacts MUST import (a failure there is a runner
  // failure the policy turns into a local fallback); a partial run keeps what it
  // can and reports the problem as a note instead of discarding good output.
  let imported = 0;
  let importProblem: string | undefined;
  const hasManifest = artifacts.files.some((file) => file.name === "shots/shots.json");
  if (remoteResult.status !== "skipped" && hasManifest) {
    if (remoteResult.status === "captured") {
      imported = importShotArtifacts(config, task.id, artifacts.files);
    } else {
      try {
        imported = importShotArtifacts(config, task.id, artifacts.files);
      } catch (err) {
        importProblem = err instanceof Error ? err.message : String(err);
      }
    }
  }
  const base = formatRemoteShotActivity(remoteResult);
  const message = importProblem
    ? `${base} (could not import runner shots: ${importProblem})`
    : imported > 0 && remoteResult.status !== "captured"
      ? `${base} (kept ${imported} earlier shot${imported === 1 ? "" : "s"} despite the failure)`
      : base;
  recordBrowserCaptureActivity(
    task.id,
    remoteResult.status === "captured",
    message,
    log,
    (note) => {
      // Local successful captures only add activity; retain a durable task
      // note for remote failures/fallbacks where the runner changed behavior.
      if (remoteResult.status !== "captured") patchTaskFile(config, task.absPath, { note });
    },
  );
  return { ...remoteResult, detail: message };
}

export function formatRemoteShotActivity(remoteResult: ShotCaptureResult): string {
  const detail = remoteResult.detail.replace(/^shots:\s*/i, "");
  return remoteResult.status === "captured"
    ? `shots: ${detail}`
    : `shots: ${remoteResult.status} — ${detail}`;
}

function importRemoteDeclaredShot(
  config: RepoOSConfig,
  taskId: string,
  artifacts: BrowserEvidenceArtifacts,
): DeclaredShotCapture {
  const result = artifacts.results.singleShot as DeclaredShotCapture | undefined;
  if (!result || typeof result !== "object")
    throw new Error("runner result omitted the single-shot outcome");
  if ("error" in result) return result;
  if (!artifacts.ok)
    throw new Error("runner reported a failed single-shot capture without an error");
  const source = result.shot as ShotMeta;
  const data = artifacts.files.find((file) => file.name === `shots/${source.name}`)?.data;
  if (!data) throw new Error(`runner omitted shot image ${source.name}`);
  const stored = localShotStore(config, taskId).save({
    target: source.target,
    route: source.route,
    ...(source.label ? { label: source.label } : {}),
    ...(source.provenance ? { provenance: source.provenance } : {}),
    ...(source.declared ? { declared: source.declared } : {}),
    name: source.name,
    mime: "image/png",
    data,
  });
  if ("error" in stored)
    throw new Error(`could not import runner shot ${source.name}: ${stored.error}`);
  return { shot: stored, warnings: result.warnings };
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
    route: string;
    /** The parsed declaration to store on the shot, for exact delete sync (#0627). */
    declared?: DeclaredShot;
  },
  remoteTransport?: BrowserEvidenceTransport,
  onFallback?: (message: string) => void,
): Promise<DeclaredShotCapture> {
  if (!reserveBrowserCapture(task.id)) {
    return { error: "a capture is already in flight for this task", busy: true };
  }
  try {
    return await captureDeclaredShotImpl(
      config,
      task,
      previews,
      entry,
      remoteTransport,
      onFallback,
    );
  } finally {
    releaseBrowserCapture(task.id);
  }
}

async function captureDeclaredShotImpl(
  config: RepoOSConfig,
  task: Task,
  previews: PreviewManager,
  entry: CaptureEntry & {
    route: string;
    declared?: DeclaredShot;
  },
  remoteTransport?: BrowserEvidenceTransport,
  onFallback?: (message: string) => void,
): Promise<DeclaredShotCapture> {
  if (
    config.remoteValidation?.browserCaptureMode &&
    config.remoteValidation.browserCaptureMode !== "local"
  ) {
    const canonical = canonicalCaptureContext(config, task);
    const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
    const head = worktree ? await runGit(worktree, ["rev-parse", "HEAD"], 10_000) : null;
    const request =
      worktree && task.branch && head?.status === 0
        ? {
            taskId: task.id,
            worktreePath: worktree,
            branch: task.branch,
            candidateSha: head.stdout.trim(),
            operation: "single-shot" as const,
            entry,
            canonical,
          }
        : null;
    try {
      return await runBrowserCaptureWithPolicy({
        config,
        request: request ?? {
          taskId: task.id,
          worktreePath: config.root,
          branch: task.branch ?? "",
          candidateSha: "",
          operation: "single-shot",
          entry,
          canonical,
        },
        transport: request ? remoteTransport : undefined,
        local: () =>
          captureDeclaredShotImpl(
            {
              ...config,
              remoteValidation: { ...config.remoteValidation, browserCaptureMode: "local" },
            },
            task,
            previews,
            entry,
          ),
        note: (message) => onFallback?.(message),
        useArtifacts: async (artifacts) => importRemoteDeclaredShot(config, task.id, artifacts),
      });
    } catch (err) {
      // `captureDeclaredShot` documents a structured error and never a throw.
      // runner-only mode makes the policy throw on a transport/runner failure,
      // so catch it here and preserve the contract for the Add-shot route
      // (#0854 pass 17).
      const detail = err instanceof Error ? err.message : String(err);
      return {
        error: `remote capture failed: ${detail}`,
        ...(err instanceof BrowserEvidenceUnavailableError && err.browserUnavailable
          ? { unavailable: true }
          : {}),
      };
    }
  }
  // Branch fixtures (#0786): URL building admits a `state` the task branch's
  // source declares, even though main's compiled list does not know it yet.
  const branchValidator = taskFixtureValidator(
    (path: string) => {
      try {
        return existsSync(path) ? readFileSync(path, "utf8") : null;
      } catch {
        return null;
      }
    },
    config,
    task,
  );
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
      browser = await launchWebkit({ repoRoot: config.root });
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
    const pageUrl = shotCapturePageUrl(url, entry, branchValidator ?? undefined);
    let captured: CapturedPage;
    try {
      captured = await captureEntryPage(context, pageUrl, entry);
    } catch (err) {
      return {
        error: `capture failed: the route may not load — ${(err as Error).message.split("\n")[0]}`,
      };
    }
    // #0866: a declared capture that rendered the wrong screen (fixture never
    // applied, target served its HTML shell) must not be stored as evidence.
    if (captured.blockingWarnings.length > 0) {
      return { error: captured.blockingWarnings.join("; ") };
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
