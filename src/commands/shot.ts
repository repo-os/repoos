/**
 * `repoos shot` (#0582) — capture screenshots of a task's managed preview.
 *
 * URL/route in, PNG out. This is a CLI concern, not core engine: it has no
 * knowledge of Vue, Storybook or any UI stack. It drives the optional
 * Playwright/WebKit path the UI smoke test already uses (`commands/ui-harness`),
 * asks the running RepoOS server to start the task's preview (the same
 * server-owned `PreviewManager` the `::repoos-preview-request::` signal reaches —
 * this command never runs `repoos serve` itself), then uploads each PNG to the
 * server's shot store under `work/.attachments/<taskId>/shots/`.
 *
 * Which preview target to shoot is decided from the changed file paths matched
 * against `[[preview.targets]].paths` globs — not the task's up-front `area` —
 * so a mislabeled area cannot silently screenshot the wrong app. `--target`
 * overrides; area resolution is the fallback. Missing Playwright is a clean
 * skip with install advice, not a crash.
 */
import { basename } from "node:path";
import { c } from "../cli/colors.js";
import { findRepoRoot, loadConfig, mainCheckoutRoot, resolveServePort } from "../core/config.js";
import { changedPathsVsBase, currentBranch } from "../core/git.js";
import { createRepoOS } from "../core/repoos.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import { buildCapturePlan, parseShotPlan, type CaptureEntry } from "../core/shot-plan.js";
import {
  formatTargetList,
  resolveShotTargets,
  type ShotTargetSource,
} from "../core/shot-targets.js";
import type { Task } from "../core/types.js";
import { readServeLocks } from "./status.js";
import { readLocalCliToken } from "../server/local-token.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "./ui-harness.js";

interface ShotResult {
  target: string;
  label?: string;
  file: string;
  path: string;
  url: string;
}

interface CmdShotOptions {
  route?: string;
  target?: string;
  selector?: string;
  taskId?: string;
  base: string;
  waitMs: number;
  viewport: { width: number; height: number };
  fullPage: boolean;
  /** Set when an argument is unknown or malformed; cmdShot prints and exits. */
  error?: string;
  /** Set for `-h`/`--help`; cmdShot prints usage and exits 0. */
  help?: boolean;
}

const VIEWPORT = { width: 1280, height: 800 };
/** Default settle after load, so a dev server's client mount finishes first. */
const DEFAULT_SETTLE_MS = 900;
const INSTALL_ADVICE = "Install: bun add -d @playwright/test && bunx playwright install webkit";

/**
 * True when a browser-launch failure is the optional Playwright/WebKit package
 * being absent or missing its binary — a clean skip with install advice, not a
 * crash. Mirrors `ui-smoke.ts`'s classification for the same dependency.
 */
export function isShotCaptureUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Cannot find module") ||
    msg.includes("not installed") ||
    msg.includes("Executable doesn't exist") ||
    msg.includes("browserType.launch")
  );
}

/** Parse `repoos shot [<route|url>] [flags]`; unknown/malformed args set `error`. */
export function parseShotArgs(args: string[]): CmdShotOptions {
  const opts: CmdShotOptions = {
    base: "main",
    waitMs: DEFAULT_SETTLE_MS,
    viewport: { ...VIEWPORT },
    fullPage: false,
  };
  let i = 0;
  const value = (flag: string): string | undefined => {
    const v = args[++i];
    if (v === undefined || (v.startsWith("-") && !/^-\d/.test(v))) {
      opts.error = `${flag} requires a value`;
      return undefined;
    }
    return v;
  };
  for (; i < args.length; i++) {
    const a = args[i];
    if (a === "--target") {
      const v = value(a);
      if (v === undefined) return opts;
      opts.target = v;
    } else if (a === "--selector") {
      const v = value(a);
      if (v === undefined) return opts;
      opts.selector = v;
    } else if (a === "--task") {
      const v = value(a);
      if (v === undefined) return opts;
      opts.taskId = v;
    } else if (a === "--base") {
      const v = value(a);
      if (v === undefined) return opts;
      opts.base = v;
    } else if (a === "--wait") {
      const v = value(a);
      if (v === undefined) return opts;
      const ms = Number(v);
      if (!Number.isFinite(ms) || ms < 0) {
        opts.error = `--wait expects milliseconds, got "${v}"`;
        return opts;
      }
      opts.waitMs = ms;
    } else if (a === "--full-page") {
      opts.fullPage = true;
    } else if (a === "--help" || a === "-h") {
      opts.help = true;
      return opts;
    } else if (a === "--viewport") {
      const v = value(a);
      if (v === undefined) return opts;
      const m = /^(\d+)x(\d+)$/.exec(v);
      if (!m) {
        opts.error = `--viewport expects WIDTHxHEIGHT, got "${v}"`;
        return opts;
      }
      opts.viewport = { width: Number(m[1]), height: Number(m[2]) };
    } else if (a.startsWith("-")) {
      opts.error = `unknown flag "${a}"`;
      return opts;
    } else if (opts.route === undefined) {
      opts.route = a;
    } else {
      opts.error = `unexpected argument "${a}"`;
      return opts;
    }
  }
  return opts;
}

/** A relative route or an absolute http(s) URL the caller asked to capture. */
function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function normalizedRoute(route: string | undefined): string {
  if (!route) return "/";
  return route.startsWith("/") ? route : `/${route}`;
}

/** The task on the main checkout's board whose branch is `branch`, or by id. */
function findTask(
  mainRoot: string,
  branch: string | null,
  taskId: string | undefined,
): Task | undefined {
  const index = createRepoOS(mainRoot).reindex();
  if (taskId) return index.tasks.find((t) => t.id === taskId);
  if (!branch) return undefined;
  return index.tasks.find((t) => t.branch === branch);
}

/** Parse the server's error body into a human message. */
async function readApiError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Headers for a loopback CLI call; carries the local token when auth is on. */
function cliHeaders(token: string | null, json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  if (token) headers["x-repoos-local-token"] = token;
  if (json) headers["content-type"] = "application/json";
  return headers;
}

async function stopPreview(
  port: number,
  taskId: string,
  token: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/preview/stop`, {
      method: "POST",
      headers: cliHeaders(token),
    });
    if (!res.ok) return { ok: false, error: await readApiError(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `could not reach the RepoOS server: ${(err as Error).message}` };
  }
}

async function startPreview(
  port: number,
  taskId: string,
  target: string,
  token: string | null,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/preview`, {
      method: "POST",
      headers: cliHeaders(token, true),
      body: JSON.stringify({ target }),
    });
  } catch (err) {
    return { ok: false, error: `could not reach the RepoOS server: ${(err as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: await readApiError(res) };
  const body = (await res.json()) as { url?: string };
  if (!body?.url) return { ok: false, error: "server returned no preview URL" };
  return { ok: true, url: body.url };
}

async function uploadShot(
  port: number,
  taskId: string,
  token: string | null,
  input: { target: string; route: string; label?: string; selector?: string; data: string },
): Promise<
  { ok: true; shot: { name: string; path: string; url: string } } | { ok: false; error: string }
> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/shots`, {
      method: "POST",
      headers: cliHeaders(token, true),
      body: JSON.stringify({
        target: input.target,
        route: input.route,
        ...(input.label ? { label: input.label } : {}),
        name: input.target,
        mime: "image/png",
        data: input.data,
      }),
    });
  } catch (err) {
    return { ok: false, error: `could not reach the RepoOS server: ${(err as Error).message}` };
  }
  if (!res.ok) return { ok: false, error: await readApiError(res) };
  const body = (await res.json()) as { shot?: { name: string; path: string; url: string } };
  if (!body?.shot) return { ok: false, error: "server returned no stored shot" };
  return { ok: true, shot: body.shot };
}

/**
 * `repoos shot` entrypoint. Returns the process exit code: 0 on success (or a
 * clean skip has already been reported), 1 on a real failure.
 */
export async function cmdShot(args: string[]): Promise<number> {
  const opts = parseShotArgs(args);
  if (opts.help) {
    console.log(`  repoos shot [<route|url>] [flags]

  Capture screenshots of this task's managed preview into
  work/.attachments/<taskId>/shots/ (gitignored), shown in the task drawer.

  Which page or state to capture can be declared in the task body: a
  "## Shots" section holding a fenced JSON list, one entry per shot:

    {"target": "default", "route": "/board", "label": "Board",
     "steps": [{"click": "button.new-task"}, {"waitMs": 300}]}

  (target/route/selector/label/steps; steps are click, fill + text,
  waitFor, or waitMs, using plain CSS selectors). The same list drives
  the server's automatic capture at handoff. Without it, "/" is captured
  per resolved target.

  Arguments:
    <route|url>        Route to capture on the preview (default "/"), or an
                       absolute http(s) URL to capture directly.

  Flags:
    --target <name>    Preview target to capture (overrides path/area resolution)
    --selector <css>   Capture one element instead of the whole page
    --task <id>        Task to shoot (defaults to the current worktree's branch)
    --base <ref>       Base branch for changed-path resolution (default "main")
    --wait <ms>        Settle time after load before capturing (default 900)
    --full-page        Capture the full scrollable page
    --viewport <WxH>   Viewport size (default 1280x800)`);
    return 0;
  }
  if (opts.error) {
    console.error(c.red("  ✗ ") + opts.error);
    console.error(
      c.dim("    usage: repoos shot [<route|url>] [--target <name>] [--selector <css>]"),
    );
    return 1;
  }
  const cwdRoot = findRepoRoot();
  const mainRoot = mainCheckoutRoot(cwdRoot) ?? cwdRoot;
  const worktreeRoot = cwdRoot;
  const worktreeConfig = loadConfig(worktreeRoot);
  const mainConfig = loadConfig(mainRoot);
  const branch = currentBranch(worktreeRoot);
  const task = findTask(mainRoot, branch, opts.taskId);

  if (!task) {
    console.error(
      c.red("  ✗ ") +
        (opts.taskId
          ? `No task #${opts.taskId} on the board.`
          : `No task found for branch "${branch ?? "(detached)"}". Pass --task <id>.`),
    );
    console.error(
      c.dim("    resolve targets with --target <name>, or run from the task's worktree."),
    );
    return 1;
  }

  const absolute = opts.route !== undefined && isAbsoluteUrl(opts.route);

  // Resolve targets from the diff unless an absolute URL was supplied (then the
  // URL itself is the subject and no target resolution is needed).
  let targets: string[] = [];
  let source: ShotTargetSource = "none";
  // What to capture (#0594): the task's declared `## Shots` list when present;
  // explicit CLI flags override it; with neither, `/` per resolved target.
  let plan: CaptureEntry[] = [];
  if (absolute) {
    targets = [opts.target ?? `url:${basename(new URL(opts.route as string).pathname) || "/"}`];
    source = "target";
    plan = [
      {
        target: targets[0],
        route: opts.route as string,
        ...(opts.selector ? { selector: opts.selector } : {}),
      },
    ];
  } else {
    const changed = changedPathsVsBase(worktreeRoot, opts.base);
    if (changed === null) {
      // A typo'd base ref must fail loudly, not look like "nothing changed".
      console.error(
        c.red("  ✗ ") + `Base ref "${opts.base}" is not a commit — cannot resolve changed paths.`,
      );
      return 1;
    }
    const resolution = resolveShotTargets(worktreeConfig.preview, task.area, changed, opts.target);
    if (resolution.names.length === 0) {
      console.error(c.red("  ✗ ") + (resolution.reason ?? "No preview target resolved."));
      if (resolution.detected.length > 0) {
        console.error(c.dim(`    changed paths touch: ${formatTargetList(resolution.detected)}`));
      }
      return 1;
    }
    targets = resolution.names;
    source = resolution.source;
    console.log(
      c.dim("  targets: ") +
        c.cyan(formatTargetList(targets)) +
        c.dim(` (from ${source === "paths" ? "changed paths" : source})`),
    );
    if (targets.length > 1) {
      console.log(
        c.dim(
          "  note: only one preview runs at a time — each target restarts the preview, so a preview you were watching will stop.",
        ),
      );
    }
    // The task's own `## Shots` declaration wins when the CLI flags did not
    // pin a route/selector — the engineer knows which page/state is visible.
    const declared =
      opts.route || opts.selector
        ? { shots: [], errors: [] as string[] }
        : parseShotPlan(task.body);
    for (const error of declared.errors) {
      console.error(c.yellow("  · ") + `declared shot list: ${error}`);
    }
    const built = buildCapturePlan(targets, declared.shots);
    for (const error of built.errors) {
      console.error(c.yellow("  · ") + error);
    }
    plan = built.entries.length
      ? built.entries
      : targets.map((target) => ({
          target,
          route: normalizedRoute(opts.route),
          ...(opts.selector ? { selector: opts.selector } : {}),
        }));
    if (built.entries.length) {
      console.log(
        c.dim(
          `  plan: ${built.entries.map((e) => `${e.target}${e.label ? ` – ${e.label}` : ""}`).join(", ")}`,
        ),
      );
    }
  }

  // Preview lifecycle is server-owned; the CLI only reaches it over HTTP. Prefer
  // the live serve lock over the configured port, like `repoos status` does, so
  // a running server on a non-default port is still found.
  const configuredPort = resolveServePort(mainRoot, mainConfig);
  const liveLock = readServeLocks(mainRoot, mainConfig.cacheDir).find(
    (l) => l.alive && (l.port ?? configuredPort) > 0,
  );
  const port = liveLock?.port ?? configuredPort;
  const baseUrl = `http://127.0.0.1:${port}`;
  // When the server has auth enabled, a browser-less CLI authenticates with the
  // loopback token it wrote (#0582); with auth off there is no token and none
  // is needed.
  const token = readLocalCliToken(mainRoot, mainConfig.cacheDir);
  try {
    await fetch(`${baseUrl}/api/health`);
  } catch {
    console.error(
      c.red("  ✗ ") +
        `RepoOS server is not reachable on ${baseUrl}. Start it with \`repoos serve\`.`,
    );
    return 1;
  }

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  const saved: ShotResult[] = [];
  try {
    try {
      browser = await launchWebkit();
      context = await browser.newContext({ serviceWorkers: "block" });
    } catch (err) {
      const msg = (err as Error).message;
      if (isShotCaptureUnavailable(err)) {
        console.error(
          c.yellow("  · ") + "Screenshot capture skipped — Playwright/WebKit unavailable",
        );
        console.error(c.dim(`    ${msg.split("\n")[0]}`));
        console.error(c.dim(`    ${INSTALL_ADVICE}`));
      } else {
        console.error(c.red("  ✗ ") + `could not launch the browser: ${msg.split("\n")[0]}`);
      }
      return 1;
    }

    let currentTarget: string | undefined;
    let currentPreviewUrl = "";
    for (const entry of plan) {
      // Only one preview runs per task, so a different target must replace
      // the running one before it can start (#0379/#0271). Same-target
      // entries reuse the running preview — no restart, no churn.
      if (entry.target !== currentTarget) {
        await stopPreview(port, task.id, token);
        const started = await startPreview(port, task.id, entry.target, token);
        if (!started.ok) {
          console.error(
            c.red("  ✗ ") + `preview for target "${entry.target}" failed: ${started.error}`,
          );
          return 1;
        }
        currentPreviewUrl = started.url.replace(/\/$/, "");
        currentTarget = entry.target;
      }
      const pageUrl = absolute
        ? entry.route
        : `${currentPreviewUrl}${normalizedRoute(entry.route)}`;
      const page = (await context.newPage()) as unknown as ShotDriverPage;
      let png: Buffer;
      try {
        await page.setViewportSize(opts.viewport);
        png = await captureShotPage(page, pageUrl, entry, {
          viewport: opts.viewport,
          waitMs: opts.waitMs,
          fullPage: opts.fullPage,
        });
      } catch (err) {
        const what = entry.selector ? `selector "${entry.selector}" on ${pageUrl}` : pageUrl;
        console.error(c.red("  ✗ ") + `capture of ${what} failed: ${(err as Error).message}`);
        await page.close();
        return 1;
      }
      await page.close();

      const uploaded = await uploadShot(port, task.id, token, {
        target: entry.target,
        route: entry.route.startsWith("/") ? normalizedRoute(entry.route) : entry.route,
        ...(entry.label ? { label: entry.label } : {}),
        data: png.toString("base64"),
      });
      if (!uploaded.ok) {
        console.error(c.red("  ✗ ") + `storing the shot failed: ${uploaded.error}`);
        return 1;
      }
      saved.push({
        target: entry.target,
        ...(entry.label ? { label: entry.label } : {}),
        file: uploaded.shot.name,
        path: uploaded.shot.path,
        url: uploaded.shot.url,
      });
      console.log(
        c.green("  ✔ ") +
          `${entry.target}${entry.label ? ` – ${entry.label}` : ""} → ${c.cyan(uploaded.shot.path)} ${c.dim(`(${Math.round(png.length / 1024)} KB)`)}`,
      );
    }
    if (saved.length === 0) {
      console.error(c.yellow("  · ") + "No shots captured.");
      return 1;
    }
    console.log(
      c.dim(
        `  ${saved.length} shot${saved.length === 1 ? "" : "s"} saved under work/.attachments/${task.id}/shots/ (never tracked by git)`,
      ),
    );
    return 0;
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}
