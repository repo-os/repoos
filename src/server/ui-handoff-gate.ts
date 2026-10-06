/**
 * UI handoff verification gate (#0680): for tasks with a shot capture plan,
 * run declared/auto shots through the managed preview while recording browser
 * console errors, failed requests, and horizontal overflow at configured
 * viewport widths. Failures block handoff and persist evidence under the cache dir.
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
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import type { CaptureEntry } from "../core/shot-plan.js";
import { provenanceCaption } from "../core/shot-plan.js";
import type { RepoOSConfig, Task } from "../core/types.js";
import { isShotCaptureUnavailable } from "../commands/shot.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "../commands/ui-harness.js";
import { captureEntryPage, planAutoCapture, type ShotCaptureResult } from "./shot-capture.js";
import type { PreviewManager } from "./preview.js";
import { localShotStore } from "./shots.js";
import { patchTaskFile } from "./write.js";

const INSTALL_ADVICE = "Install: bun add -d @playwright/test && bunx playwright install webkit";
const AUTO_SETTLE_MS = 900;

export interface UiHandoffGateEvidence {
  at: string;
  issues: PageGateIssue[];
  blankShots: string[];
  captures: number;
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

/** Whether this task should run the gate during handoff finalization. */
export function taskNeedsUiHandoffVerification(config: RepoOSConfig, task: Task): boolean {
  const policy = resolvedUiVerification(config);
  if (!policy.enabled) return false;
  const plan = planAutoCapture(config, task);
  return !("reason" in plan);
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

/**
 * Capture one entry and collect browser gate issues on the same page session.
 */
async function captureEntryWithGate(
  context: SmokeContext,
  pageUrl: string,
  entry: CaptureEntry,
  viewports: number[],
): Promise<{ png: Buffer; issues: PageGateIssue[]; blank: boolean; warnings: string[] }> {
  const warnings: string[] = [];
  const collector = createPageGateCollector(pageUrl);
  const page = (await context.newPage()) as unknown as ShotDriverPage & PageGateListenerPage;
  collector.attach(page);
  const issues: PageGateIssue[] = [];
  try {
    await page.setViewportSize({ width: viewports[0] ?? 1024, height: 800 });
    const png = await captureShotPage(
      page,
      pageUrl,
      entry,
      { waitMs: AUTO_SETTLE_MS, fullPage: false },
      (selector, route) => {
        warnings.push(`highlight ${selector} matched nothing on ${route}`);
      },
      (selector, route) => {
        warnings.push(`selector ${selector} matched nothing on ${route}`);
      },
    );
    issues.push(...collector.drain());
    for (const width of viewports) {
      const overflow = await checkHorizontalOverflowAtViewport(
        page,
        width,
        entry.label ?? entry.route,
      );
      if (overflow) issues.push(overflow);
    }
    return { png, issues, blank: pngLooksBlank(png), warnings };
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
  let captured = 0;

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
          return { ok: true, skipped: true, detail };
        }
        return {
          ok: false,
          detail: `ui verification: could not launch browser — ${(err as Error).message}`,
        };
      }
    }

    for (const entry of entries) {
      if (entry.target !== currentTarget) {
        const started = await startPreview(entry.target);
        if ("error" in started) {
          return {
            ok: false,
            detail: `ui verification: preview for "${entry.target}" did not start: ${started.error}`,
          };
        }
        currentUrl = started.url;
        currentTarget = entry.target;
      }
      const pageUrl = `${currentUrl}${entry.route.startsWith("/") ? entry.route : `/${entry.route}`}`;
      let png: Buffer;
      let issues: PageGateIssue[];
      let warnings: string[] = [];
      let blank = false;
      try {
        const result = await captureEntry(context!, pageUrl, entry, viewports);
        png = result.png;
        issues = result.issues;
        warnings = result.warnings;
        blank = result.blank;
      } catch (err) {
        return {
          ok: false,
          detail: `ui verification: capture of ${entry.route} failed — ${(err as Error).message.split("\n")[0]}`,
        };
      }
      allIssues.push(...issues);
      if (blank) {
        allIssues.push({
          kind: "blank",
          message: `blank-looking screenshot for ${entry.target}${entry.route}`,
        });
        blankShots.push(`${entry.target}${entry.route}`);
      }
      for (const msg of warnings) {
        log(task.id, "warn", `shots: ${msg}`);
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
        data: png.toString("base64"),
      });
      if ("error" in stored) {
        return {
          ok: false,
          detail: `ui verification: shot store rejected image — ${stored.error}`,
        };
      }
      captured++;
    }
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

  const shotDetail = `${captured} shot${captured === 1 ? "" : "s"} captured with clean console`;
  log(task.id, "info", `ui verification: ${shotDetail}`);

  return {
    ok: true,
    detail: shotDetail,
    evidencePath: path,
    shotResult: { status: "captured", detail: shotDetail, count: captured },
  };
}

/** Test helper: run gate logic against captureEntryPage without monitoring (legacy path). */
