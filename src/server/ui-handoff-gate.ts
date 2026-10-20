/**
 * UI handoff verification gate (#0680, #0734): for tasks with a shot capture
 * plan, run declared/auto shots through the managed preview while recording
 * browser console errors, failed requests, and horizontal overflow at
 * configured viewport widths. Failures block handoff and persist evidence
 * under the cache dir.
 *
 * #0734: the FINAL URL after redirects is compared to the
 * declared route (a login/redirect to a different page can no longer pass as
 * the shot), and declared `assert` conditions (element present/count/text) are
 * evaluated on the captured page. Each capture's exact URL, matched
 * assertions, stored PNG path (in the MAIN checkout, where the reviewer looks)
 * and the tested tree identity are recorded in the evidence.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { LogLevel } from "../core/logger.js";
import {
  checkHorizontalOverflowAtViewport,
  createPageGateCollector,
  formatPageGateIssues,
  pngLooksBlank,
  type PageGateIssue,
  type PageGateListenerPage,
} from "../core/page-browser-gate.js";
import { resolvedUiVerification } from "../core/ui-verification-config.js";
import {
  evaluateShotAssertions,
  formatAssertionSummary,
  type AssertionPage,
  type ShotAssertionOutcome,
} from "../core/shot-assertions.js";
import { shotCapturePageUrl } from "../core/shot-fixtures.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import type { CaptureEntry } from "../core/shot-plan.js";
import {
  countDeclaredShotEntries,
  provenanceCaption,
  parseShotPlan,
  shotPlanFingerprint,
  taskFixtureValidator,
} from "../core/shot-plan.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import {
  addDetachedWorktree,
  linkInheritedEnv,
  mainCheckoutRoot,
  removeDetachedWorktree,
  runGit,
  worktreePathForBranch,
} from "../core/git.js";
import { isShotCaptureUnavailable } from "../commands/shot.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "../commands/ui-harness.js";
import {
  captureCommandEntries,
  captureEntryPage,
  planAutoCapture,
  reserveBrowserCapture,
  releaseBrowserCapture,
  type CommandCaptureEvidence,
  type ShotCaptureResult,
} from "./shot-capture.js";
import type { PreviewManager } from "./preview.js";
import { importShotArtifacts, localShotStore, shotsDir, shotUrl, type ShotMeta } from "./shots.js";
import { withPreviewVerificationSlot } from "./preview-verification-slot.js";
import { patchTaskFile } from "./write.js";
import {
  recordBrowserCaptureActivity,
  runBrowserCaptureWithPolicy,
  type BrowserEvidenceArtifacts,
  type BrowserEvidenceTransport,
} from "./browser-capture-policy.js";
import { canonicalCaptureContext, type CanonicalCapturePlan } from "../core/remote-capture.js";

const INSTALL_ADVICE = "Install: bun add -d @playwright/test && bunx playwright install webkit";
const AUTO_SETTLE_MS = 900;
const PREVIEW_DISCONNECT_RE =
  /could not connect|ECONNREFUSED|net::ERR_CONNECTION|Connection refused/i;

function isPreviewDisconnectError(err: unknown): boolean {
  return PREVIEW_DISCONNECT_RE.test((err as Error).message ?? "");
}

/** Per-capture evidence (#0734): exact URL, assertions, and the stored PNG. */
export interface UiHandoffGateCapture {
  target: string;
  route: string;
  label?: string;
  /** The exact URL navigated to (with the preview origin). */
  url: string;
  /** The final pathname after any login/redirect, as the browser landed. */
  finalRoute: string;
  /** Set when the final route differed from the declared one (login/redirect). */
  redirectNote?: string;
  /** Whether the final route matched the declared route. */
  routeMatched: boolean;
  /** Assertion outcomes evaluated against this captured page. */
  assertions: ShotAssertionOutcome[];
  /** Count of assertions that passed (and how many were checked). */
  assertionsPassed: number;
  assertionsChecked: number;
  /** Stored PNG metadata (main-checkout storage, where the reviewer looks). */
  shot?: { name: string; path: string; url: string };
  /** Non-blocking highlight/selector/step misses (#0743). */
  targetWarnings?: string[];
  /**
   * #0753: the issues this capture produced — its console errors, failed
   * same-origin requests, horizontal overflow, and a blank-looking PNG, plus the
   * route/assertion issues the gate derives from THIS capture. Issues belong to
   * a shot, so they ride on the capture rather than only in the handoff-wide
   * `issues` list, which lets the Changes tab show them in that shot's popover
   * instead of repeating every issue on every row.
   */
  issues?: PageGateIssue[];
}

export interface UiHandoffGateEvidence {
  at: string;
  issues: PageGateIssue[];
  blankShots: string[];
  captures: number;
  /** #0734: the plan identity the captures were produced from. */
  planFingerprint?: string;
  /** #0734: the tested tree identity (HEAD sha of the worktree that was captured). */
  sourceIdentity?: string;
  /** #0734: absolute worktree path the captures were taken from. */
  sourceWorktree?: string;
  /** #0734: absolute directory holding the stored PNGs (main checkout). */
  evidenceDir?: string;
  /** #0734: per-capture detail — URL, assertions, stored PNG path. */
  captureDetails?: UiHandoffGateCapture[];
  /**
   * #0765: per-capture provenance for command targets (`[[shot.targets]]`).
   * A command target has no page and no browser console, so its record carries
   * the command, cwd, exit status, stdout/stderr tail and the images it
   * produced instead of a URL/console section. Its presence is how the reviewer
   * and the mechanical checks know browser verification does not apply.
   */
  commandCaptures?: CommandCaptureEvidence[];
  /** Non-blocking shot target warnings across all captures (#0743). */
  warnings?: string[];
  /**
   * #0755: set by the READER (route/review) to the branch HEAD at the moment
   * the evidence was served, and whether it differs from the captured
   * `sourceIdentity`. Stored on disk only as `sourceIdentity`; these are
   * derived, so a capture can never claim to describe a tree it did not.
   */
  reviewedHead?: string;
  stale?: boolean;
}

/** Whether a stored capture describes the currently reviewed HEAD (#0755). */
export type HandoffTreeStatus = "current" | "stale" | "unknown";

/**
 * Compare the tree a handoff capture recorded (`sourceIdentity`) against the
 * branch HEAD the review/close-out will use. `unknown` when either side is
 * missing — an absence of evidence is never treated as a match (#0755).
 */
export function handoffTreeStatus(
  evidence: Pick<UiHandoffGateEvidence, "sourceIdentity"> | null | undefined,
  currentHead: string | null | undefined,
): HandoffTreeStatus {
  const captured = evidence?.sourceIdentity?.trim();
  const head = currentHead?.trim();
  if (!captured || !head) return "unknown";
  return captured === head ? "current" : "stale";
}

/** Human sentence for a stale/unknown tree, or empty when it is current. */
export function handoffTreeNote(
  status: HandoffTreeStatus,
  evidence: Pick<UiHandoffGateEvidence, "sourceIdentity"> | null | undefined,
  currentHead: string | null | undefined,
): string {
  if (status === "current") return "";
  if (status === "stale") {
    return (
      `STALE — handoff capture is for tree ${evidence?.sourceIdentity ?? "(unknown)"} ` +
      `but the reviewed HEAD is ${currentHead ?? "(unknown)"}; re-capture on the final tree`
    );
  }
  return "handoff capture has no recorded tree — cannot be tied to the reviewed HEAD";
}

/**
 * Paths whose movement never invalidates a capture (#0766). Task bookkeeping
 * files (`work/*.md` — status flips, activity notes, review counters) land on
 * the branch after the capture ran and do not change any app the captures
 * describe; #0600 already treats work-file commits as the task's own
 * bookkeeping everywhere else. Everything else — source, docs, config, another
 * task's file — keeps the capture stale (fail-closed: docs are content a
 * docs-site capture can legitimately show, so only task bookkeeping is exempt).
 */
const TASK_BOOKKEEPING_PATH_RE = /^work\/.*\.md$/;

async function diffIsTaskBookkeepingOnly(
  diffRoot: string,
  fromSha: string,
  toHead: string,
): Promise<boolean> {
  const diff = await runGit(diffRoot, ["diff", "--name-only", fromSha, toHead], 10_000);
  if (diff.status !== 0) return false;
  const paths = diff.stdout
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
  return paths.length > 0 && paths.every((p) => TASK_BOOKKEEPING_PATH_RE.test(p));
}

/**
 * The staleness verdict as the review should act on it (#0766): the mechanical
 * {@link handoffTreeStatus} comparison, softened only for HEAD movement that is
 * provably pure task bookkeeping — a diff of nothing but `work/*.md` files
 * between the captured tree and the reviewed one. Returns "stale" for every
 * git problem (an unreachable sha, a missing worktree), so an unclassifiable
 * drift is never presented as current evidence.
 */
export async function effectiveHandoffTreeStatus(
  diffRoot: string | null | undefined,
  evidence: Pick<UiHandoffGateEvidence, "sourceIdentity"> | null | undefined,
  currentHead: string | null | undefined,
): Promise<HandoffTreeStatus> {
  const status = handoffTreeStatus(evidence, currentHead);
  if (status !== "stale") return status;
  const captured = evidence?.sourceIdentity?.trim();
  const head = currentHead?.trim();
  if (!diffRoot || !captured || !head || captured === head) return status;
  return (await diffIsTaskBookkeepingOnly(diffRoot, captured, head)) ? "current" : "stale";
}

export interface UiHandoffGateResult {
  ok: boolean;
  skipped?: boolean;
  detail: string;
  evidencePath?: string;
  shotResult?: ShotCaptureResult;
}

export type TaskLog = (taskId: string, level: LogLevel, message: string) => void;

function cacheRoot(root: string, cacheDir: string): string {
  return join(root, cacheDir || ".repoos");
}

function evidenceFile(config: RepoOSConfig, taskId: string): string {
  return join(cacheRoot(config.root, config.cacheDir), "ui-verification", `${taskId}.json`);
}

/**
 * The MAIN-checkout directory holding a task's captured PNGs (#0734). Captures
 * are written through the root config on purpose — the reviewer and the server
 * read `config.root`, while a worktree's own copy has no `.attachments` — so
 * the reviewer prompt must point here, not at the worktree.
 */
export function taskEvidenceDir(config: RepoOSConfig, taskId: string): string {
  return shotsDir(config.root, config.workDir, taskId);
}

export function readUiHandoffGateEvidence(
  config: RepoOSConfig,
  taskId: string,
): UiHandoffGateEvidence | null {
  const file = evidenceFile(config, taskId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as UiHandoffGateEvidence;
  } catch {
    return null;
  }
}

/** Whether this task should run the gate during handoff. */
export function taskNeedsUiHandoffVerification(config: RepoOSConfig, task: Task): boolean {
  const policy = resolvedUiVerification(config);
  if (!policy.enabled) return false;
  const plan = planAutoCapture(config, task);
  return !("reason" in plan);
}

/**
 * Which kind of UI verification applies to this task (#0765):
 *   - `browser` — the plan has WEB capture entries: the page gate runs, records
 *     console errors, and a missing/blocking record is a real gap;
 *   - `command` — ONLY `[[shot.targets]]` command entries: images are rendered
 *     by a command, there is no page and no browser console, so the mechanical
 *     console-error check must be `skipped`, never `not_run`, and the reviewer
 *     is told not to expect a console log;
 *   - `none` — no capture plan applies.
 * A mixed plan is `browser` (web wins, matching capture order).
 */
export type UiVerificationMode = "browser" | "command" | "none";

export function taskUiVerificationMode(config: RepoOSConfig, task: Task): UiVerificationMode {
  const policy = resolvedUiVerification(config);
  if (!policy.enabled) return "none";
  const plan = planAutoCapture(config, task);
  if ("reason" in plan) return "none";
  const commandTargets = new Set((config.shot?.targets ?? []).map((t) => t.name));
  let hasWeb = false;
  let hasCommand = false;
  for (const entry of plan.entries) {
    if (commandTargets.has(entry.target)) hasCommand = true;
    else hasWeb = true;
  }
  if (hasWeb) return "browser";
  return hasCommand ? "command" : "none";
}

/** True when browser page verification applies — the mechanical console check's trigger. */
export function taskNeedsBrowserUiVerification(config: RepoOSConfig, task: Task): boolean {
  return taskUiVerificationMode(config, task) === "browser";
}

/** A preflight outcome: ok (go ahead), block (fail with detail), or skip. */
export interface UiEvidencePreflight {
  ok: boolean;
  skipped?: boolean;
  detail: string;
}

/**
 * Cheap evidence preflight (#0734), run AFTER the commit gate's build but
 * BEFORE the expensive handoff suite (remote validation + full `repoos check`).
 *
 * It does no browsing: it only resolves the declared capture plan and inspects
 * the identity of any prior automatic captures. Its job is to fail fast — and
 * actionably — when a declaration that REQUIRES visual acceptance cannot even
 * produce a plan entry (an unresolvable target, a docs-only route, a
 * malformed declaration), rather than after minutes of remote checks. It also
 * reports whether prior evidence is stale (plan/tree changed) so the following
 * capture is expected, not surprising.
 */
export async function preflightUiEvidence(
  config: RepoOSConfig,
  task: Task,
): Promise<UiEvidencePreflight> {
  const policy = resolvedUiVerification(config);
  if (!policy.enabled) return { ok: true, skipped: true, detail: "ui verification disabled" };
  // Detect required assertions straight from the declaration, so a plan that
  // produced no entries (an unresolvable target, a docs-only route) still
  // blocks here rather than silently skipping past the requirement.
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
  const declared = parseShotPlan(
    task.body ?? "",
    fixtureValidator ? { fixtureValidator } : undefined,
  );
  const declaredRequiredAssertions = declared.shots.some((s) =>
    (s.assert ?? []).some((a) => a.optional !== true),
  );
  const assertParseErrors = declared.errors.filter((e) => /assert/i.test(e));
  if (assertParseErrors.length > 0) {
    return {
      ok: false,
      detail: `ui evidence preflight: declared assertions are malformed — ${assertParseErrors.join("; ")}`,
    };
  }
  const plan = planAutoCapture(config, task);
  if ("reason" in plan) {
    if (declaredRequiredAssertions) {
      return {
        ok: false,
        detail:
          "ui evidence preflight: the task declares required visual assertions but no capture " +
          `can be produced — ${plan.reason}`,
      };
    }
    return { ok: true, skipped: true, detail: plan.reason };
  }
  const assertErrors = plan.errors.filter((e) => /assert/i.test(e));
  if (assertErrors.length > 0) {
    return {
      ok: false,
      detail: `ui evidence preflight: declared assertions could not be resolved — ${assertErrors.join("; ")}`,
    };
  }
  if (plan.entries.length === 0 && declaredRequiredAssertions) {
    return {
      ok: false,
      detail:
        "ui evidence preflight: the task declares required visual assertions but no capture " +
        `entry was produced (${[...plan.errors, ...plan.skips].join("; ") || "no captures planned"})`,
    };
  }
  // Stale-evidence note (never blocking): the capture below will refresh it.
  const planFingerprint = shotPlanFingerprint(plan.entries);
  const worktree = task.branch ? worktreePathForBranch(config.root, task.branch) : null;
  const sourceIdentity = worktree
    ? (await runGit(worktree, ["rev-parse", "--short", "HEAD"], 10_000)).stdout.trim()
    : "";
  const prior = localShotStore(config, task.id)
    .list()
    .filter((s) => s.origin === "auto");
  const stale = prior.filter(
    (s) =>
      s.planFingerprint !== planFingerprint ||
      (sourceIdentity && s.sourceIdentity !== sourceIdentity),
  );
  if (prior.length > 0 && stale.length > 0) {
    return {
      ok: true,
      detail: `${stale.length} prior handoff capture(s) do not match the current plan/tree — a fresh capture will run`,
    };
  }
  return { ok: true, detail: `ui evidence preflight: ${plan.entries.length} capture(s) planned` };
}

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

/** Normalize a route/URL pathname for comparison (trailing slash, query kept). */
function normalizePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  // Trailing slash on a non-root path is insignificant for route matching.
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

/** The pathname+search of a final URL, for route-match reporting. */
function finalRouteOf(finalUrl: string): string {
  try {
    const u = new URL(finalUrl);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return finalUrl;
  }
}

/**
 * Compare the browser's final route to the declared one. A preview app that
 * redirects an unauthenticated request to `/login`, or a client-side guard
 * that bounces to another page, means the captured PNG is NOT the declared
 * evidence (#0734). We compare pathname only — the preview origin differs per
 * run and the query string is part of the route when the declaration set one.
 */
function routeMatches(declared: string, finalRoute: string): boolean {
  const declaredPath = normalizePath(declared.split("?")[0] ?? declared);
  const finalPath = normalizePath((finalRoute.split("?")[0] ?? finalRoute) || "/");
  return declaredPath === finalPath;
}

/**
 * #0830: a declared shot whose step, highlight, or selector target is missing
 * must block handoff with a per-shot message. Auto-matched captures stay
 * lenient — warnings only (#0743).
 */
function declaredShotTargetIssues(
  entry: CaptureEntry,
  warnings: string[],
  finalUrl: string,
): PageGateIssue[] {
  if (entry.provenance.kind !== "declared") return [];
  const shotName = entry.label?.trim() || `${entry.target}${entry.route}`;
  return warnings.map((msg) => ({
    kind: "missing-target",
    message: `${shotName}: ${msg}`,
    url: finalUrl,
  }));
}

/**
 * Capture one entry and collect browser gate issues on the same page session.
 * #0734: the final URL (after redirects) and assertion outcomes are returned so
 * the caller can block on a wrong route or an unmet required assertion.
 */
async function captureEntryWithGate(
  context: SmokeContext,
  pageUrl: string,
  entry: CaptureEntry & { route: string },
  viewports: number[],
): Promise<{
  png: Buffer;
  issues: PageGateIssue[];
  blank: boolean;
  warnings: string[];
  finalUrl: string;
  assertions: ShotAssertionOutcome[];
}> {
  const warnings: string[] = [];
  const collector = createPageGateCollector(pageUrl);
  const page = (await context.newPage()) as unknown as ShotDriverPage &
    PageGateListenerPage & { url?(): string };
  collector.attach(page);
  const issues: PageGateIssue[] = [];
  try {
    await page.setViewportSize({ width: viewports[0] ?? 1024, height: 800 });
    const png = await captureShotPage(
      page,
      pageUrl,
      entry,
      { waitMs: AUTO_SETTLE_MS, fullPage: false },
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
        // #0755: a capture that lands on a loading state (after steps + settle)
        // is a FAILED step, not a passing capture — the content never rendered.
        onLoadingState: (message, route) => {
          warnings.push(`${message} on ${route}`);
        },
        // #0782: a declared theme the driver could not set would make the
        // light/dark evidence wrong — recorded, never silent.
        onThemeMiss: (theme, route) => {
          warnings.push(`theme ${theme} could not be applied on ${route}`);
        },
      },
    );
    issues.push(...collector.drain());
    // #0734: where did the browser actually land? A login redirect silently
    // produces a screenshot of the wrong page.
    const finalUrl = typeof page.url === "function" ? page.url() : pageUrl;
    // Assertions run on the SAME page session that produced the PNG, before the
    // overflow re-checks resize the viewport.
    const assertionReport = await evaluateShotAssertions(
      page as unknown as AssertionPage,
      entry.assert,
    );
    for (const width of viewports) {
      const overflow = await checkHorizontalOverflowAtViewport(
        page,
        width,
        entry.label ?? entry.route,
      );
      if (overflow) issues.push(overflow);
    }
    return {
      png,
      issues,
      blank: pngLooksBlank(png),
      warnings,
      finalUrl,
      assertions: assertionReport.outcomes,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export interface UiHandoffGateDeps {
  launchBrowser?: () => Promise<{ browser: SmokeBrowser; context: SmokeContext }>;
  startPreview?: (target: string) => Promise<{ url: string } | { error: string }>;
  captureEntry?: typeof captureEntryWithGate;
  /** When set, bypasses Playwright and runs this hook instead (unit tests). */
  syntheticIssues?: PageGateIssue[];
  /** Test hook: the tested tree identity, when git is unavailable. */
  sourceIdentity?: string;
  /** Explicit evidence refresh: replace engineer captures and keep task Markdown untouched. */
  forceRefresh?: boolean;
  recordTaskNotes?: boolean;
  /** Runner transport for the configured remote browser capture policy. */
  remoteTransport?: BrowserEvidenceTransport;
  /**
   * The control plane's resolved plan. The runner passes it so it verifies the
   * same entries the board would, instead of re-planning from the bundle (#0854).
   */
  canonicalPlan?: CanonicalCapturePlan;
}

/** A blocking issue from a required assertion that failed (#0734). */
function assertionIssue(entry: CaptureEntry, url: string, message: string): PageGateIssue {
  return {
    kind: "assertion",
    message: `${entry.label ?? `${entry.target}${entry.route}`}: ${message} (captured ${url})`,
    url,
  };
}

/**
 * Run shots + browser verification synchronously during handoff.
 */
export async function runUiHandoffGate(
  config: RepoOSConfig,
  task: Task,
  previews: PreviewManager | undefined,
  log: TaskLog,
  deps: UiHandoffGateDeps = {},
): Promise<UiHandoffGateResult> {
  if (deps.syntheticIssues) {
    const path = evidenceFile(config, task.id);
    const evidence: UiHandoffGateEvidence = {
      at: new Date().toISOString(),
      issues: deps.syntheticIssues,
      blankShots: [],
      captures: 0,
    };
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(evidence, null, 2));
    const detail = `ui verification failed (${deps.syntheticIssues.length} issue(s)): ${formatPageGateIssues(deps.syntheticIssues)}`;
    return { ok: false, detail, evidencePath: path };
  }

  // An explicit refresh is an operator request, so engineer-made captures do
  // not pre-empt it. Still honor the repository-wide disabled policy.
  if (
    !resolvedUiVerification(config).enabled ||
    (!deps.forceRefresh && !taskNeedsUiHandoffVerification(config, task))
  ) {
    return { ok: true, skipped: true, detail: "ui verification not required for this task" };
  }

  // Resolve the plan against the canonical board body and live config ONCE, then
  // hand it to the runner: the bundled branch can lag a `## Shots` edit and its
  // detached checkout cannot re-diff changed paths, so a runner-planned
  // verification could differ from — or skip — what local capture does (#0854).
  const plan: CanonicalCapturePlan | { reason: string } =
    deps.canonicalPlan ?? planAutoCapture(config, task, { forceRefresh: deps.forceRefresh });
  if ("reason" in plan) {
    return { ok: true, skipped: true, detail: plan.reason };
  }

  if (
    config.remoteValidation?.browserCaptureMode &&
    config.remoteValidation.browserCaptureMode !== "local"
  ) {
    if (!reserveBrowserCapture(task.id)) {
      return {
        ok: false,
        detail: "ui verification failed: a browser capture is already in flight for this task",
      };
    }
    try {
      const canonical = canonicalCaptureContext(config, task, plan);
      const sourceWorktree =
        (task.branch ? worktreePathForBranch(config.root, task.branch) : null) ?? config.root;
      const head = await runGit(sourceWorktree, ["rev-parse", "HEAD"], 10_000);
      const request =
        task.branch && head.status === 0
          ? {
              taskId: task.id,
              worktreePath: sourceWorktree,
              branch: task.branch,
              candidateSha: head.stdout.trim(),
              operation: "verify" as const,
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
            operation: "verify",
            canonical,
          },
          transport: request ? deps.remoteTransport : undefined,
          local: () =>
            runUiHandoffGate(
              {
                ...config,
                remoteValidation: { ...config.remoteValidation, browserCaptureMode: "local" },
              },
              task,
              previews,
              log,
              { ...deps, remoteTransport: undefined },
            ),
          note: (message) => log(task.id, "warn", `ui verification: ${message}`),
          useArtifacts: async (artifacts) => importRemoteVerification(config, task, artifacts, log),
        });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { ok: false, detail: `ui verification failed: ${detail}` };
      }
    } finally {
      releaseBrowserCapture(task.id);
    }
  }

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
  const declaredParse = parseShotPlan(
    task.body ?? "",
    fixtureValidator ? { fixtureValidator } : undefined,
  );
  const declaredEntryCount = countDeclaredShotEntries(task.body ?? "");

  const viewports = resolvedUiVerification(config).viewportWidths ?? [1024, 375];
  // #0765: the gate handles BOTH kinds of capture. A web entry (#0734) is driven
  // in a browser and checked for console errors / routes / assertions; a command
  // entry (#0761) has no page — its command renders the images, and the gate
  // records the command's provenance (exit status, stdout/stderr tail, image
  // sizes) with NO browser console section.
  const commandTargets = new Set((config.shot?.targets ?? []).map((t) => t.name));
  const webEntries = plan.entries.filter(
    (e): e is CaptureEntry & { route: string } =>
      e.route !== undefined && !commandTargets.has(e.target),
  );
  const commandEntries = plan.entries.filter((e) => commandTargets.has(e.target));
  if (webEntries.length === 0 && commandEntries.length === 0) {
    return { ok: true, skipped: true, detail: "no capture entries to verify" };
  }
  // A command capture needs no preview: only require the preview manager when a
  // web entry will actually be driven.
  if (webEntries.length > 0 && !previews && !deps.startPreview) {
    return {
      ok: true,
      skipped: true,
      detail: "ui verification skipped — no preview manager",
    };
  }
  const allIssues: PageGateIssue[] = [];
  const blankShots: string[] = [];
  const captureDetails: UiHandoffGateCapture[] = [];
  const commandCaptures: CommandCaptureEvidence[] = [];
  const allWarnings: string[] = [];
  let captured = 0;
  for (const error of declaredParse.errors) {
    const line = `declared shot not captured — ${error}`;
    allWarnings.push(line);
    log(task.id, "warn", `ui verification: ${line}`);
  }
  for (const error of plan.errors) {
    if (declaredParse.errors.includes(error)) continue;
    const line = `declared shot not captured — ${error}`;
    allWarnings.push(line);
    log(task.id, "warn", `ui verification: ${line}`);
  }
  for (const skip of plan.skips) {
    // #0819: the skip text is already a complete, actionable sentence
    // ("Docs site skipped: no docs shot declared"), so it is not wrapped in
    // the "declared shot not captured" framing — that prefix made a docs-only
    // skip read as a failed declaration.
    const line = skip;
    allWarnings.push(line);
    log(task.id, "warn", `ui verification: ${line}`);
  }

  // #0734: identity of what is being captured, so a reviewer can tie the
  // evidence to the tested source/plan rather than trusting a timestamp. The
  // fingerprint covers the WHOLE plan (web + command) so a command capture's
  // evidence is bound to the same plan/tree identity a web capture uses (#0765),
  // and the automatic capture's reuse rule agrees with it.
  const planFingerprint = shotPlanFingerprint(plan.entries);
  const sourceWorktree =
    (task.branch ? worktreePathForBranch(config.root, task.branch) : null) ?? config.root;
  let sourceIdentity = deps.sourceIdentity ?? "";
  if (!sourceIdentity) {
    const head = await runGit(sourceWorktree, ["rev-parse", "--short", "HEAD"], 10_000);
    if (head.status === 0) sourceIdentity = head.stdout.trim();
  }
  const evidenceDir = taskEvidenceDir(config, task.id);

  const store = localShotStore(config, task.id);
  let cleared = false;
  const ensureCleared = (): void => {
    if (!cleared) {
      if (deps.forceRefresh) store.clearForRefresh();
      else store.removeAuto();
      cleared = true;
    }
  };

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let currentTarget: string | undefined;
  let currentUrl = "";

  const captureEntry = deps.captureEntry ?? captureEntryWithGate;
  const startPreview =
    deps.startPreview ??
    (async (target: string) => {
      if (!previews) return { error: "no preview manager" };
      return startTargetPreview(previews, task, target);
    });

  try {
    await withPreviewVerificationSlot(task.id, log, async () => {
      // Command-only tasks reach here too (#0765) but need no browser; the
      // command capture runs AFTER this slot is released so a slow command
      // never holds the single preview slot.
      if (webEntries.length === 0) return;
      if (deps.launchBrowser) {
        const launched = await deps.launchBrowser();
        browser = launched.browser;
        context = launched.context;
      } else {
        try {
          browser = await launchWebkit({
            repoRoot: config.root,
            onQueueLine: (line) => log(task.id, "info", line),
          });
          context = await browser.newContext({ serviceWorkers: "block" });
        } catch (err) {
          if (isShotCaptureUnavailable(err)) {
            const detail = `Playwright/WebKit unavailable (${(err as Error).message.split("\n")[0]}). ${INSTALL_ADVICE}`;
            log(task.id, "warn", `ui verification: skipped — ${detail}`);
            throw Object.assign(new Error("__skip__"), { skip: true, detail });
          }
          throw err;
        }
      }

      for (const entry of webEntries) {
        if (entry.target !== currentTarget) {
          const started = await startPreview(entry.target);
          if ("error" in started) {
            throw new Error(
              `ui verification: preview for "${entry.target}" did not start: ${started.error}`,
            );
          }
          currentUrl = started.url;
          currentTarget = entry.target;
        }
        const pageUrl = shotCapturePageUrl(currentUrl, entry, fixtureValidator ?? undefined);
        let png: Buffer;
        let issues: PageGateIssue[];
        let warnings: string[] = [];
        let blank = false;
        let finalUrl = pageUrl;
        let assertionOutcomes: ShotAssertionOutcome[] = [];
        let disconnectRetries = 0;
        for (;;) {
          try {
            const result = await captureEntry(context!, pageUrl, entry, viewports);
            png = result.png;
            issues = result.issues;
            warnings = result.warnings;
            blank = result.blank;
            finalUrl = result.finalUrl;
            assertionOutcomes = result.assertions;
            break;
          } catch (err) {
            if (disconnectRetries === 0 && isPreviewDisconnectError(err)) {
              disconnectRetries++;
              log(
                task.id,
                "warn",
                "ui verification: preview disconnected — restarting preview and retrying capture once",
              );
              if (previews) await previews.stop(task.id).catch(() => {});
              currentTarget = undefined;
              const restarted = await startPreview(entry.target);
              if ("error" in restarted) {
                throw new Error(
                  `ui verification: preview for "${entry.target}" did not restart after disconnect: ${restarted.error}`,
                );
              }
              currentUrl = restarted.url;
              currentTarget = entry.target;
              continue;
            }
            throw new Error(
              `ui verification: capture of ${entry.route} failed — ${(err as Error).message.split("\n")[0]}`,
            );
          }
        }
        allIssues.push(...issues);
        // #0753: issues belong to the shot that produced them. Start the
        // capture's own list with what the page gate collected (console errors,
        // failed same-origin requests, overflow), then add the route/blank/
        // assertion issues the gate derives from this same capture below — so
        // the Changes tab can show them in THAT shot's popover rather than
        // repeating the whole handoff's list on every row.
        const captureIssues: PageGateIssue[] = [...issues];

        for (const msg of warnings) {
          const line = `${msg} (captured ${finalUrl})`;
          allWarnings.push(line);
          const level = entry.provenance.kind === "declared" ? "error" : "warn";
          log(task.id, level, `ui verification: shot warning — ${msg}`);
        }
        for (const issue of declaredShotTargetIssues(entry, warnings, finalUrl)) {
          allIssues.push(issue);
          captureIssues.push(issue);
        }

        // #0734: the browser must have LANDED on the declared route. A login
        // redirect (or any client-side bounce) means the PNG is not the evidence
        // the task declared.
        const finalRoute = finalRouteOf(finalUrl);
        const matched = routeMatches(entry.route, finalRoute);
        let redirectNote: string | undefined;
        if (!matched) {
          redirectNote = `declared route ${entry.route} but the browser landed on ${finalRoute} (login or redirect?)`;
          const routeIssue: PageGateIssue = {
            kind: "route",
            message: `${entry.label ?? `${entry.target}${entry.route}`}: ${redirectNote} (captured ${finalUrl})`,
            url: finalUrl,
          };
          allIssues.push(routeIssue);
          captureIssues.push(routeIssue);
        }

        // #0734: required assertions must hold.
        const blockingAssertions = assertionOutcomes.filter((o) => o.blocking);
        for (const outcome of blockingAssertions) {
          const issue = assertionIssue(entry, finalUrl, outcome.detail);
          allIssues.push(issue);
          captureIssues.push(issue);
        }

        if (blank) {
          const blankIssue: PageGateIssue = {
            kind: "blank",
            message: `blank-looking screenshot for ${entry.target}${entry.route}`,
          };
          allIssues.push(blankIssue);
          captureIssues.push(blankIssue);
          blankShots.push(`${entry.target}${entry.route}`);
        }

        ensureCleared();
        const stored = store.save({
          origin: "auto",
          target: entry.target,
          route: entry.route,
          ...(entry.label ? { label: entry.label } : {}),
          provenance: provenanceCaption(entry.provenance),
          planFingerprint,
          ...(sourceIdentity ? { sourceIdentity } : {}),
          data: png.toString("base64"),
        });
        if ("error" in stored) {
          throw new Error(`ui verification: shot store rejected image — ${stored.error}`);
        }
        captured++;

        const storedMeta = stored as ShotMeta;
        captureDetails.push({
          target: entry.target,
          route: entry.route,
          ...(entry.label ? { label: entry.label } : {}),
          url: finalUrl,
          finalRoute,
          ...(redirectNote ? { redirectNote } : {}),
          routeMatched: matched,
          assertions: assertionOutcomes,
          assertionsPassed: assertionOutcomes.filter((o) => o.passed).length,
          assertionsChecked: assertionOutcomes.length,
          ...(warnings.length ? { targetWarnings: warnings } : {}),
          ...(captureIssues.length ? { issues: captureIssues } : {}),
          shot: {
            name: storedMeta.name,
            path: storedMeta.path,
            url: shotUrl(task.id, storedMeta.name),
          },
        });

        if (assertionOutcomes.length > 0) {
          log(
            task.id,
            "info",
            `ui verification: ${entry.label ?? entry.route} — ${formatAssertionSummary({
              outcomes: assertionOutcomes,
              failures: [],
            })}`,
          );
        }
      }
    });
  } catch (err) {
    const skip = err as Error & { skip?: boolean; detail?: string };
    if (skip.skip && skip.detail) {
      return { ok: true, skipped: true, detail: skip.detail };
    }
    const message = (err as Error).message;
    return { ok: false, detail: message };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    if (previews && currentTarget !== undefined) await previews.stop(task.id).catch(() => {});
  }

  // #0765: command targets have no page and no console — run the commands,
  // store the images, and record provenance (command, cwd, exit status,
  // stdout/stderr tail, image sizes). A command problem is a visible warning,
  // never a failed handoff, exactly as in the automatic capture path.
  //
  // #0766: an explicit refresh runs commands in a detached worktree at the
  // reviewed HEAD so a misbehaving command cannot dirty the task worktree.
  let commandRoot = sourceWorktree;
  let detachedCommandPath: string | undefined;
  if (deps.forceRefresh && commandEntries.length > 0) {
    const fullHead = await runGit(sourceWorktree, ["rev-parse", "HEAD"], 10_000);
    if (fullHead.status !== 0 || !fullHead.stdout.trim()) {
      return {
        ok: false,
        detail: "could not resolve the task worktree HEAD for command capture",
      };
    }
    const mainRoot = mainCheckoutRoot(config.root);
    const parentDir = join(mainRoot, config.cacheDir, "command-capture");
    const detached = await addDetachedWorktree(mainRoot, parentDir, fullHead.stdout.trim());
    if (!detached.ok) {
      return {
        ok: false,
        detail: `could not create isolated worktree for command capture: ${detached.error}`,
      };
    }
    detachedCommandPath = detached.path;
    commandRoot = detached.path;
    linkInheritedEnv(mainRoot, detached.path);
  }
  if (commandEntries.length > 0) {
    try {
      const batch = captureCommandEntries({
        config,
        task,
        entries: commandEntries,
        commandRoot,
        planFingerprint,
        sourceIdentity,
        store,
        ensureCleared,
        clearPriorOnCommandSkip: deps.forceRefresh,
      });
      captured += batch.captured;
      commandCaptures.push(...batch.evidence);
      if (batch.fatal) {
        log(task.id, "warn", `ui verification: shots: failed — ${batch.fatal}`);
      }
      for (const ev of batch.evidence) {
        if (ev.status !== "captured") {
          log(
            task.id,
            "warn",
            `ui verification: shots: ${ev.status} — ${ev.reason ?? "capture failed"}`,
          );
          continue;
        }
        for (const msg of ev.warnings ?? []) {
          log(task.id, "warn", `ui verification: shots: ${msg}`);
        }
      }
    } finally {
      if (detachedCommandPath) {
        await removeDetachedWorktree(mainCheckoutRoot(config.root), detachedCommandPath);
      }
    }
  }

  const path = evidenceFile(config, task.id);
  const evidence: UiHandoffGateEvidence = {
    at: new Date().toISOString(),
    issues: allIssues,
    blankShots,
    captures: captured,
    planFingerprint,
    sourceIdentity,
    sourceWorktree,
    evidenceDir,
    captureDetails,
    ...(commandCaptures.length ? { commandCaptures } : {}),
    ...(allWarnings.length ? { warnings: allWarnings } : {}),
  };
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(evidence, null, 2));
  } catch {
    /* best-effort */
  }

  if (allIssues.length > 0) {
    const detail = `ui verification failed (${allIssues.length} issue(s)): ${formatPageGateIssues(allIssues)}`;
    log(task.id, "error", detail);
    if (deps.recordTaskNotes !== false) {
      try {
        patchTaskFile(config, task.absPath, { note: detail.slice(0, 500) });
      } catch {
        /* best-effort */
      }
    }
    return { ok: false, detail, evidencePath: path };
  }

  if (deps.forceRefresh && captured === 0) {
    const detail = "evidence was not refreshed: no shots were captured";
    log(task.id, "warn", `ui verification: ${detail}`);
    return { ok: false, skipped: true, detail };
  }

  const warnNote =
    allWarnings.length > 0
      ? ` (${allWarnings.length} shot warning${allWarnings.length === 1 ? "" : "s"})`
      : "";
  const count =
    declaredEntryCount > 0
      ? `${captured} of ${declaredEntryCount} shot${declaredEntryCount === 1 ? "" : "s"}`
      : `${captured} shot${captured === 1 ? "" : "s"}`;
  // A command-only task has no console to be clean (#0765) — say what the
  // evidence actually is rather than the web phrase.
  const shotDetail =
    webEntries.length > 0
      ? `${count} captured with clean console${warnNote}`
      : `${count} captured from command target(s) — no browser console${warnNote}`;
  log(task.id, "info", `ui verification: ${shotDetail}`);

  return {
    ok: true,
    detail: shotDetail,
    evidencePath: path,
    shotResult: { status: "captured", detail: shotDetail, count: captured },
  };
}

export async function importRemoteVerification(
  config: RepoOSConfig,
  task: Task,
  artifacts: BrowserEvidenceArtifacts,
  log: TaskLog,
): Promise<UiHandoffGateResult> {
  const taskId = task.id;
  const result = artifacts.results.verification as UiHandoffGateResult | undefined;
  if (!result || typeof result.ok !== "boolean" || typeof result.detail !== "string") {
    throw new Error("runner result omitted the UI verification outcome");
  }
  // A PARTIAL/FAILED run keeps whatever shots it did produce, before validating
  // the verification record: those PNGs are real evidence and must not be
  // discarded (#0854, "never discard good output"). A run the runner called
  // SUCCESSFUL validates its record FIRST — a malformed record is a runner
  // failure and must never replace existing evidence (the policy then falls back
  // locally); only after validation does it import.
  let imported = 0;
  let importProblem: string | undefined;
  const hasShots = artifacts.files.some((file) => file.name === "shots/shots.json");
  if (!result.ok && hasShots) {
    try {
      imported = importShotArtifacts(config, taskId, artifacts.files);
    } catch (err) {
      importProblem = err instanceof Error ? err.message : String(err);
    }
  }
  const importSuffix = importProblem
    ? ` (could not import runner shots: ${importProblem})`
    : imported > 0 && !result.ok
      ? ` (kept ${imported} earlier shot${imported === 1 ? "" : "s"} despite the failure)`
      : "";
  const evidence = artifacts.files.find((file) => file.name === "verification.json");
  if (!evidence) {
    if (result.skipped) {
      return importSuffix ? { ...result, detail: `${result.detail}${importSuffix}` } : result;
    }
    throw new Error(`runner result omitted the UI verification record${importSuffix}`);
  }
  let evidenceJson: unknown;
  try {
    evidenceJson = JSON.parse(Buffer.from(evidence.data, "base64").toString("utf8"));
  } catch {
    throw new Error(`runner returned a malformed UI verification record${importSuffix}`);
  }
  if (
    !evidenceJson ||
    typeof evidenceJson !== "object" ||
    typeof (evidenceJson as UiHandoffGateEvidence).at !== "string" ||
    !Array.isArray((evidenceJson as UiHandoffGateEvidence).issues) ||
    !Array.isArray((evidenceJson as UiHandoffGateEvidence).blankShots) ||
    !(evidenceJson as UiHandoffGateEvidence).blankShots.every((shot) => typeof shot === "string") ||
    !Number.isInteger((evidenceJson as UiHandoffGateEvidence).captures) ||
    (evidenceJson as UiHandoffGateEvidence).captures < 0
  ) {
    throw new Error(`runner returned an invalid UI verification record${importSuffix}`);
  }
  if (result.ok && hasShots) {
    importShotArtifacts(config, taskId, artifacts.files);
  }
  const path = evidenceFile(config, taskId);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(evidenceJson, null, 2));
  const note = `ui verification ${result.ok ? "passed" : "failed"}: ${result.detail}`;
  recordBrowserCaptureActivity(task.id, result.ok, note, log, (taskNote) => {
    patchTaskFile(config, task.absPath, { note: taskNote });
  });
  return { ...result, evidencePath: path };
}
