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
import { currentBranch } from "../core/git.js";
import { createRepoOS } from "../core/repoos.js";
import {
  formatTargetList,
  resolveShotTargets,
  type ShotTargetSource,
} from "../core/shot-targets.js";
import type { Task } from "../core/types.js";
import { changedPathsSince } from "./check.js";
import { readLocalCliToken } from "../server/local-token.js";
import { launchWebkit, type SmokeBrowser, type SmokeContext } from "./ui-harness.js";

/** A Playwright page with the two methods capture needs beyond the smoke harness. */
interface ShotPage {
  goto(url: string, options: { waitUntil: string; timeout: number }): Promise<unknown>;
  setViewportSize(viewport: { width: number; height: number }): Promise<void>;
  screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
  locator(selector: string): { screenshot(options?: { fullPage?: boolean }): Promise<Buffer> };
  close(): Promise<void>;
}

interface ShotResult {
  target: string;
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
  viewport: { width: number; height: number };
  fullPage: boolean;
}

const VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 30_000;
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

/** Parse `repoos shot [<route|url>] [flags]`. */
function parseArgs(args: string[]): CmdShotOptions {
  const opts: CmdShotOptions = { base: "main", viewport: { ...VIEWPORT }, fullPage: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--target") opts.target = args[++i];
    else if (a === "--selector") opts.selector = args[++i];
    else if (a === "--task") opts.taskId = args[++i];
    else if (a === "--base") opts.base = args[++i] ?? "main";
    else if (a === "--full-page") opts.fullPage = true;
    else if (a === "--viewport") {
      const m = /^(\d+)x(\d+)$/.exec(args[++i] ?? "");
      if (m) opts.viewport = { width: Number(m[1]), height: Number(m[2]) };
    } else if (!a.startsWith("-") && opts.route === undefined) opts.route = a;
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

/** Base64 PNG bytes for one capture, or a thrown error Playwright reports. */
async function capture(
  page: ShotPage,
  url: string,
  selector: string | undefined,
  fullPage: boolean,
): Promise<Buffer> {
  await page.goto(url, { waitUntil: "load", timeout: NAV_TIMEOUT_MS });
  if (selector) return page.locator(selector).screenshot({ fullPage });
  return page.screenshot({ fullPage });
}

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
  input: { target: string; route: string; selector?: string; data: string },
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
  const opts = parseArgs(args);
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
  const route = normalizedRoute(opts.route);

  // Resolve targets from the diff unless an absolute URL was supplied (then the
  // URL itself is the subject and no target resolution is needed).
  let targets: string[] = [];
  let source: ShotTargetSource = "none";
  if (absolute) {
    targets = [opts.target ?? `url:${basename(new URL(opts.route as string).pathname) || "/"}`];
    source = "target";
  } else {
    const changed = changedPathsSince(worktreeRoot, opts.base) ?? [];
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
  }

  // Preview lifecycle is server-owned; the CLI only reaches it over HTTP.
  const port = resolveServePort(mainRoot, mainConfig);
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

    for (const target of targets) {
      let pageUrl: string;
      if (absolute) {
        pageUrl = opts.route as string;
      } else {
        // Only one preview runs per task, so a different target must replace
        // the running one before it can start (#0379/#0271).
        await stopPreview(port, task.id, token);
        const started = await startPreview(port, task.id, target, token);
        if (!started.ok) {
          console.error(c.red("  ✗ ") + `preview for target "${target}" failed: ${started.error}`);
          return 1;
        }
        pageUrl = `${started.url}${route}`;
      }
      const page = (await context.newPage()) as unknown as ShotPage;
      let png: Buffer;
      try {
        await page.setViewportSize(opts.viewport);
        png = await capture(page, pageUrl, opts.selector, opts.fullPage);
      } catch (err) {
        console.error(c.red("  ✗ ") + `capture of ${pageUrl} failed: ${(err as Error).message}`);
        await page.close();
        return 1;
      }
      await page.close();

      const uploaded = await uploadShot(port, task.id, token, {
        target,
        route,
        ...(opts.selector ? { selector: opts.selector } : {}),
        data: png.toString("base64"),
      });
      if (!uploaded.ok) {
        console.error(c.red("  ✗ ") + `storing the shot failed: ${uploaded.error}`);
        return 1;
      }
      saved.push({
        target,
        file: uploaded.shot.name,
        path: uploaded.shot.path,
        url: uploaded.shot.url,
      });
      console.log(
        c.green("  ✔ ") +
          `${target} → ${c.cyan(uploaded.shot.path)} ${c.dim(`(${Math.round(png.length / 1024)} KB)`)}`,
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
