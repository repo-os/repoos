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
import { provenanceCaption, parseShotPlan, shotPlanFingerprint } from "../core/shot-plan.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { runGit, worktreePathForBranch } from "../core/git.js";
import { isShotCaptureUnavailable } from "../commands/shot.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "../commands/ui-harness.js";
import { captureEntryPage, planAutoCapture, type ShotCaptureResult } from "./shot-capture.js";
import type { PreviewManager } from "./preview.js";
import { localShotStore, shotsDir, shotUrl, type ShotMeta } from "./shots.js";
import { withPreviewVerificationSlot } from "./preview-verification-slot.js";
import { patchTaskFile } from "./write.js";

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
  /** Non-blocking shot target warnings across all captures (#0743). */
  warnings?: string[];
}

export interface UiHandoffGateResult {
  ok: boolean;
  skipped?: boolean;
  detail: string;
  evidencePath?: string;
  shotResult?: ShotCaptureResult;
}

type TaskLog = (taskId: string, level: LogLevel, message: string) => void;

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
  const declared = parseShotPlan(task.body ?? "");
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
 * Capture one entry and collect browser gate issues on the same page session.
 * #0734: the final URL (after redirects) and assertion outcomes are returned so
 * the caller can block on a wrong route or an unmet required assertion.
 */
async function captureEntryWithGate(
  context: SmokeContext,
  pageUrl: string,
  entry: CaptureEntry,
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
    const png = await captureShotPage(page, pageUrl, entry, { waitMs: AUTO_SETTLE_MS, fullPage: false }, {
      onHighlightMiss: (selector, route) => {
        warnings.push(`highlight ${selector} matched nothing on ${route}`);
      },
      onSelectorMiss: (selector, route) => {
        warnings.push(`selector ${selector} matched nothing on ${route}`);
      },
      onStepMiss: (message, route) => {
        warnings.push(`${message} on ${route}`);
      },
    });
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

  if (!taskNeedsUiHandoffVerification(config, task)) {
    return { ok: true, skipped: true, detail: "ui verification not required for this task" };
  }

  if (!previews && !deps.startPreview) {
    return {
      ok: true,
      skipped: true,
      detail: "ui verification skipped — no preview manager",
    };
  }

  const plan = planAutoCapture(config, task);
  if ("reason" in plan) {
    return { ok: true, skipped: true, detail: plan.reason };
  }

  const viewports = resolvedUiVerification(config).viewportWidths ?? [1024, 375];
  const entries = plan.entries;
  const allIssues: PageGateIssue[] = [];
  const blankShots: string[] = [];
  const captureDetails: UiHandoffGateCapture[] = [];
  const allWarnings: string[] = [];
  let captured = 0;

  // #0734: identity of what is being captured, so a reviewer can tie the
  // evidence to the tested source/plan rather than trusting a timestamp.
  const planFingerprint = shotPlanFingerprint(entries);
  const sourceWorktree =
    (task.branch ? worktreePathForBranch(config.root, task.branch) : null) ?? config.root;
  let sourceIdentity = deps.sourceIdentity ?? "";
  if (!sourceIdentity) {
    const head = await runGit(sourceWorktree, ["rev-parse", "--short", "HEAD"], 10_000);
    if (head.status === 0) sourceIdentity = head.stdout.trim();
  }
  const evidenceDir = taskEvidenceDir(config, task.id);

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  let currentTarget: string | undefined;
  let currentUrl = "";
  let cleared = false;

  const captureEntry = deps.captureEntry ?? captureEntryWithGate;
  const startPreview =
    deps.startPreview ??
    (async (target: string) => {
      if (!previews) return { error: "no preview manager" };
      return startTargetPreview(previews, task, target);
    });

  try {
    await withPreviewVerificationSlot(task.id, log, async () => {
    if (deps.launchBrowser) {
      const launched = await deps.launchBrowser();
      browser = launched.browser;
      context = launched.context;
    } else {
      try {
        browser = await launchWebkit();
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

    for (const entry of entries) {
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
      const pageUrl = shotCapturePageUrl(currentUrl, entry);
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

      // #0743: missing highlight/selector/step targets are visible warnings only.
      for (const msg of warnings) {
        const line = `${msg} (captured ${finalUrl})`;
        allWarnings.push(line);
        log(task.id, "warn", `ui verification: shot warning — ${msg}`);
      }

      // #0734: the browser must have LANDED on the declared route. A login
      // redirect (or any client-side bounce) means the PNG is not the evidence
      // the task declared.
      const finalRoute = finalRouteOf(finalUrl);
      const matched = routeMatches(entry.route, finalRoute);
      let redirectNote: string | undefined;
      if (!matched) {
        redirectNote = `declared route ${entry.route} but the browser landed on ${finalRoute} (login or redirect?)`;
        allIssues.push({
          kind: "route",
          message: `${entry.label ?? `${entry.target}${entry.route}`}: ${redirectNote} (captured ${finalUrl})`,
          url: finalUrl,
        });
      }

      // #0734: required assertions must hold.
      const blockingAssertions = assertionOutcomes.filter((o) => o.blocking);
      for (const outcome of blockingAssertions) {
        allIssues.push(assertionIssue(entry, finalUrl, outcome.detail));
      }

      if (blank) {
        allIssues.push({
          kind: "blank",
          message: `blank-looking screenshot for ${entry.target}${entry.route}`,
        });
        blankShots.push(`${entry.target}${entry.route}`);
      }

      const store = localShotStore(config, task.id);
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
    try {
      patchTaskFile(config, task.absPath, { note: detail.slice(0, 500) });
    } catch {
      /* best-effort */
    }
    return { ok: false, detail, evidencePath: path };
  }

  const warnNote =
    allWarnings.length > 0
      ? ` (${allWarnings.length} shot warning${allWarnings.length === 1 ? "" : "s"})`
      : "";
  const shotDetail = `${captured} shot${captured === 1 ? "" : "s"} captured with clean console${warnNote}`;
  log(task.id, "info", `ui verification: ${shotDetail}`);

  return {
    ok: true,
    detail: shotDetail,
    evidencePath: path,
    shotResult: { status: "captured", detail: shotDetail, count: captured },
  };
}
