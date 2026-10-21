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
import { basename, extname, join } from "node:path";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { c } from "../cli/colors.js";
import { findRepoRoot, loadConfig, mainCheckoutRoot, resolveServePort } from "../core/config.js";
import { changedPathsVsBase, currentBranch } from "../core/git.js";
import { createRepoOS } from "../core/repoos.js";
import { shotCapturePageUrl } from "../core/shot-fixtures.js";
import { captureShotPage, type ShotDriverPage } from "../core/shot-page.js";
import { runShotCommand, slugName } from "../core/shot-command.js";
import { shotsDir } from "../server/shots.js";
import {
  buildCapturePlan,
  parseShotPlan,
  provenanceCaption,
  taskFixtureValidator,
  type CaptureEntry,
} from "../core/shot-plan.js";
import {
  describeShotTargetPathMatches,
  describeTargetPathMatches,
  appPreviewTargetName,
  formatTargetList,
  resolveShotTargets,
  shotTargetByName,
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
  /** True when `--wait` was passed (not the default settle). */
  waitMsExplicit?: boolean;
  viewport: { width: number; height: number };
  /** True when `--viewport` was passed (not the default size). */
  viewportExplicit?: boolean;
  fullPage: boolean;
  /** Extra env for a command capture target (#0769), from repeated `--env KEY=VAL`. */
  env?: Record<string, string>;
  /** Per-entry output glob for a command capture target (#0769), from `--glob`. */
  glob?: string;
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
    } else if (a === "--env") {
      const v = value(a);
      if (v === undefined) return opts;
      const eq = v.indexOf("=");
      const key = eq > 0 ? v.slice(0, eq) : "";
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        opts.error = `--env expects KEY=VALUE with a valid variable name, got "${v}"`;
        return opts;
      }
      opts.env = { ...opts.env, [key]: v.slice(eq + 1) };
    } else if (a === "--glob") {
      const v = value(a);
      if (v === undefined) return opts;
      opts.glob = v;
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
      opts.waitMsExplicit = true;
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
      opts.viewportExplicit = true;
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

/** Everything the capture plan for one `repoos shot` invocation depends on. */
export interface CliShotPlanInput {
  /** The task body, read for its `## Shots` declaration. */
  body: string;
  /** The positional route, when the caller typed one (not an absolute URL). */
  route?: string;
  /** `--selector`, when given. */
  selector?: string;
  /** Target names resolved from changed paths / the task's area / `--target`. */
  targets: string[];
  /** Per-target matched globs, for the fallback caption (#0603). */
  matchedGlobs: ReadonlyMap<string, string[]>;
  /** Targets whose matched files are docs content only (#0603). */
  docsContentOnly: ReadonlySet<string>;
  /** Command capture target names (#0761) — no route, run a command instead. */
  commandTargets?: ReadonlySet<string>;
  /** Extra env for a command capture target (#0769), from `--env KEY=VAL`. */
  env?: Record<string, string>;
  /** Per-entry output glob for a command capture target (#0769), from `--glob`. */
  glob?: string;
  /** Fixture validator for the task branch, to accept branch-specific fixtures (#0786). */
  fixtureValidator?: (id: string) => boolean;
  /** The target that serves the main app, for state/app-route defaults (#0866). */
  appTarget?: string;
}

/** The plan plus the visible notes `cmdShot` prints alongside it. */
export interface CliShotPlan {
  entries: CaptureEntry[];
  /** Problems with the task's declared `## Shots` list itself. */
  declaredErrors: string[];
  /** Per-entry problems the plan builder reported. */
  errors: string[];
  /** Visible skip notes (docs-content-only targets, …). */
  skips: string[];
}

/**
 * The capture plan for one `repoos shot` run, as a pure function of the task
 * body, the CLI flags and the resolved targets (#0610). Pulled out of
 * `cmdShot` so the wiring is testable without a server, git or a browser: the
 * bug it fixes — a typed route losing to the `/` fallback — lived in the single
 * line that picked between two candidate plans, so no plan-level test could
 * reach it.
 *
 * Precedence, documented in `user-docs/cli.md` and `repoos shot --help`: an
 * explicit route/selector replaces the WHOLE declared list. A declared entry
 * carries steps, a highlight and a label authored for its own route, so
 * re-pointing entry #2 at a route the engineer typed would click selectors that
 * may not exist there. The flag says "shoot this", not "shoot this instead of
 * that entry" — and the fallback then carries the requested route to every
 * resolved target, which is what it always meant.
 */
export function buildCliShotPlan(input: CliShotPlanInput): CliShotPlan {
  const pinned = Boolean(input.route || input.selector);
  const declared = pinned
    ? { shots: [], errors: [] }
    : parseShotPlan(
        input.body,
        input.fixtureValidator ? { fixtureValidator: input.fixtureValidator } : undefined,
      );
  const built = buildCapturePlan(input.targets, declared.shots, {
    matchedGlobs: input.matchedGlobs,
    docsContentOnly: input.docsContentOnly,
    ...(input.commandTargets ? { commandTargets: input.commandTargets } : {}),
    ...(input.appTarget ? { appTarget: input.appTarget } : {}),
    route: input.route,
    selector: input.selector,
    ...(input.env ? { env: input.env } : {}),
    ...(input.glob ? { glob: input.glob } : {}),
  });
  return {
    entries: built.entries,
    declaredErrors: declared.errors,
    errors: built.errors,
    skips: built.autoSkips,
  };
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

/**
 * Why this invocation must keep capturing locally even in a runner mode
 * (#0874). The remote single-shot path reproduces the declared plan exactly, so
 * a request it cannot represent — an arbitrary absolute URL, an explicit
 * viewport, settle time, or full-page frame — stays local rather than silently
 * capturing something different. Command targets are always local and never
 * reach this check.
 */
export function remoteWebCaptureBlocker(
  mode: "local" | "runner-available" | "runner-only" | undefined,
  absolute: boolean,
  opts: Pick<CmdShotOptions, "fullPage" | "viewportExplicit" | "waitMsExplicit">,
): string | undefined {
  if (!mode || mode === "local") return undefined;
  if (absolute) return "an absolute URL targets no preview, so remote capture does not apply";
  if (opts.fullPage) return "--full-page stays local";
  if (opts.viewportExplicit) return "--viewport stays local";
  if (opts.waitMsExplicit) return "--wait stays local";
  return undefined;
}

interface RemoteShotResponse {
  entry: CaptureEntry & { route: string };
  ok: true;
  shot: { name: string; path: string; url: string };
  warnings: string[];
  note?: string;
}

/**
 * Capture one web entry through the server's browser-capture policy (#0874):
 * the server starts the preview on the runner when configured, or falls back
 * to a server-side local capture with a visible note. `unsupported` marks an
 * older server without the route, so the caller can keep its local path.
 */
export async function captureRemoteShot(
  port: number,
  taskId: string,
  token: string | null,
  entry: CaptureEntry & { route: string },
): Promise<
  | (RemoteShotResponse & { unsupported?: false })
  | { ok: false; error: string; unsupported?: boolean }
> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/shots/capture`, {
      method: "POST",
      headers: cliHeaders(token, true),
      body: JSON.stringify({ entry, provenance: entry.provenance }),
    });
  } catch (err) {
    return { ok: false, error: `could not reach the RepoOS server: ${(err as Error).message}` };
  }
  if (res.status === 404 || res.status === 405) {
    // Distinguish "this server predates the route" from a real 404 the route
    // itself returns (an unknown task). The router's unmatched-route answer is
    // `{ error: "Not found", path }`; the handler's is a specific message.
    let body: { error?: string; path?: string } | undefined;
    try {
      body = (await res.json()) as { error?: string; path?: string };
    } catch {
      body = undefined;
    }
    if (res.status === 404 && body?.error && body.error !== "Not found") {
      return { ok: false, error: body.error };
    }
    return {
      ok: false,
      error: "remote shot capture is not available on this server",
      unsupported: true,
    };
  }
  if (!res.ok) return { ok: false, error: await readApiError(res) };
  const body = (await res.json()) as Omit<RemoteShotResponse, "entry" | "ok">;
  if (!body?.shot) return { ok: false, error: "server returned no stored shot" };
  return {
    entry,
    ok: true,
    shot: body.shot,
    warnings: Array.isArray(body.warnings) ? body.warnings : [],
    ...(typeof body.note === "string" && body.note ? { note: body.note } : {}),
  };
}

async function uploadShot(
  port: number,
  taskId: string,
  token: string | null,
  input: {
    target: string;
    route?: string;
    command?: "command";
    label?: string;
    provenance?: string;
    selector?: string;
    name?: string;
    mime?: string;
    data: string;
    warnings?: string[];
  },
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
        ...(input.route ? { route: input.route } : {}),
        ...(input.command ? { command: input.command } : {}),
        ...(input.label ? { label: input.label } : {}),
        ...(input.provenance ? { provenance: input.provenance } : {}),
        name: input.name ?? input.target,
        mime: input.mime ?? "image/png",
        data: input.data,
        ...(input.warnings?.length ? { warnings: input.warnings } : {}),
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

    {"target": "default", "route": "/repository", "label": "Task drawer",
     "highlight": ".drawer .task-title",
     "steps": [{"click": "button.new-task"}, {"waitMs": 300}]}

  (target/route/selector/label/highlight/steps; steps are click, fill + text,
  waitFor, or waitMs, using plain CSS selectors; highlight is an optional
  selector outlined around the changed element before capture — say what
  changed). The same list drives the server's automatic capture at handoff.
  Without it, "/" is captured per resolved target — by this command when you
  run it, and by the automatic capture only when the diff touches a UI
  target's paths; diffs touching just tests or task notes stand down with a
  visible "shots: skipped — no UI change to capture" note instead.

  A repo with no dev server (a native macOS, iOS/Android or desktop app) can
  declare a command capture target in repoos.toml as a [[shot.targets]] row —
  a command that renders image files into REPOOS_SHOT_DIR. --target <name>
  selects one, and its images are stored like any other shot; no browser is
  needed. --env KEY=VALUE and --glob narrow what such a target renders and which
  produced files are kept (a declared ## Shots entry can carry the same as
  "env"/"args"/"glob"). See user-docs/configuration.md.

  An explicit <route> or --selector replaces the declared list outright, and
  applies to every resolved target: declared entries carry steps, a highlight
  and a label written for their own route, so they are never re-pointed at a
  route you typed. A named route also counts as the justification a
  docs-content-only target needs, so it is captured instead of skipped.

  Captures honour remoteValidation.browserCaptureMode: runner-available prefers
  a capable runner and falls back to a local capture with a visible note;
  runner-only reports the runner's failure instead of capturing locally. An
  absolute URL or an explicit --viewport/--wait/--full-page stays local
  (runner-only reports the structured error instead).

  Arguments:
    <route|url>        Route to capture on the preview (default "/"), or an
                       absolute http(s) URL to capture directly.

  Flags:
    --target <name>    Preview target to capture (overrides path/area resolution)
    --selector <css>   Capture one element instead of the whole page
    --env KEY=VAL      (command target) pass an env var to the capture command;
                       repeat per variable, e.g. --env DIVOT_SNAPSHOT_ONLY=worldclock
    --glob <glob>      (command target) collect only produced files matching this glob
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
      c.dim(
        "    usage: repoos shot [<route|url>] [--target <name>] [--selector <css>] [--env K=V] [--glob <glob>]",
      ),
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
        // An absolute URL is the subject by construction; nothing to attribute.
        provenance: { kind: "auto" },
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
    const resolution = resolveShotTargets(
      worktreeConfig.preview,
      task.area,
      changed,
      opts.target,
      worktreeConfig.shot,
    );
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
    // Provenance + docs gate need the same match detail the server uses (#0603):
    // which globs matched per target, and which targets matched docs content
    // only (for those, a route-less declared shot or the blind `/` fallback is
    // skipped — a docs home page shows the site, not the change; a route the
    // caller typed by hand is the justification that skip asks for, so it is
    // captured).
    const matchedGlobs = new Map<string, string[]>();
    const docsContentOnly = new Set<string>();
    for (const match of describeTargetPathMatches(worktreeConfig.preview, changed)) {
      matchedGlobs.set(match.target, match.globs);
      if (match.contentOnly) docsContentOnly.add(match.target);
    }
    for (const match of describeShotTargetPathMatches(worktreeConfig.shot, changed)) {
      matchedGlobs.set(match.target, match.globs);
      if (match.contentOnly) docsContentOnly.add(match.target);
    }
    const commandTargets = new Set((worktreeConfig.shot?.targets ?? []).map((t) => t.name));
    const appTarget = appPreviewTargetName(worktreeConfig.preview);
    // #0610: the requested route/selector is part of the plan, not a separate
    // candidate that lost to the fallback's `/`.
    const fixtureValidator = taskFixtureValidator(
      (path: string) => {
        try {
          return existsSync(path) ? readFileSync(path, "utf8") : null;
        } catch {
          return null;
        }
      },
      mainConfig,
      task,
    );
    const built = buildCliShotPlan({
      body: task.body,
      route: opts.route,
      selector: opts.selector,
      targets,
      matchedGlobs,
      docsContentOnly,
      commandTargets,
      ...(appTarget ? { appTarget } : {}),
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.glob ? { glob: opts.glob } : {}),
      ...(fixtureValidator ? { fixtureValidator } : {}),
    });
    for (const error of built.declaredErrors) {
      console.error(c.yellow("  · ") + `declared shot list: ${error}`);
    }
    for (const error of built.errors) {
      console.error(c.yellow("  · ") + error);
    }
    for (const skip of built.skips) {
      console.error(c.yellow("  · ") + `skipped: ${skip}`);
    }
    plan = built.entries;
    if (plan.length > 0) {
      console.log(
        c.dim(
          `  plan: ${plan
            .map(
              (e) =>
                `${e.target}${e.route === "/" ? "" : ` ${e.route}`}${e.label ? ` – ${e.label}` : ""}`,
            )
            .join(", ")}`,
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

  const commandTargets = new Set((worktreeConfig.shot?.targets ?? []).map((t) => t.name));
  const webPlan = plan.filter(
    (e): e is CaptureEntry & { route: string } => !commandTargets.has(e.target),
  );
  const commandPlan = plan.filter((e) => commandTargets.has(e.target));

  let browser: SmokeBrowser | undefined;
  let context: SmokeContext | undefined;
  const saved: ShotResult[] = [];
  const remoteMode = mainConfig.remoteValidation?.browserCaptureMode ?? "local";
  const remoteBlocker = remoteWebCaptureBlocker(remoteMode, absolute, opts);
  let remoteWeb = webPlan.length > 0 && remoteMode !== "local" && !remoteBlocker;
  if (webPlan.length > 0 && remoteMode !== "local" && remoteBlocker) {
    if (remoteMode === "runner-only") {
      // runner-only promises no local browser work; silently capturing locally
      // would break that promise. Fail with the reason instead.
      console.error(
        c.red("  ✗ ") + `runner-only capture cannot represent this request: ${remoteBlocker}`,
      );
      return 1;
    }
    console.log(c.dim(`  note: ${remoteBlocker} — capturing locally`));
  }
  const ensureBrowser = async (): Promise<boolean> => {
    if (context) return true;
    try {
      browser = await launchWebkit({
        repoRoot: cwdRoot,
        onQueueLine: (line) => console.log(c.dim(`  ${line}`)),
      });
      context = await browser.newContext({ serviceWorkers: "block" });
      return true;
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
      return false;
    }
  };
  try {
    if (remoteWeb) {
      for (const entry of webPlan) {
        const captured = await captureRemoteShot(port, task.id, token, entry);
        if (!captured.ok && captured.unsupported) {
          // An older running server has no capture route: keep the pre-#0874
          // local path rather than failing the capture outright — unless the
          // configured policy forbids local work.
          if (remoteMode === "runner-only") {
            console.error(c.red("  ✗ ") + `runner-only capture failed: ${captured.error}`);
            return 1;
          }
          console.log(
            c.dim("  note: the running server has no remote shot capture — capturing locally"),
          );
          remoteWeb = false;
          break;
        }
        if (!captured.ok) {
          console.error(
            c.red("  ✗ ") + `remote capture of ${entry.route} failed: ${captured.error}`,
          );
          return 1;
        }
        if (captured.note) console.error(c.yellow("  · ") + captured.note);
        for (const warning of captured.warnings) {
          console.error(c.yellow("  · ") + warning);
        }
        saved.push({
          target: entry.target,
          ...(entry.label ? { label: entry.label } : {}),
          file: captured.shot.name,
          path: captured.shot.path,
          url: captured.shot.url,
        });
        console.log(
          c.green("  ✔ ") +
            `${entry.target}${entry.label ? ` – ${entry.label}` : ""} → ${c.cyan(captured.shot.path)} ${c.dim("(runner)")}`,
        );
      }
    }

    if (!remoteWeb && webPlan.length > 0) {
      if (!(await ensureBrowser())) return 1;

      let currentTarget: string | undefined;
      // Branch fixtures (#0786): URL building admits a `state` the task branch's
      // source declares even before main's compiled list knows it.
      const captureValidator = taskFixtureValidator(
        (path: string) => {
          try {
            return existsSync(path) ? readFileSync(path, "utf8") : null;
          } catch {
            return null;
          }
        },
        mainConfig,
        task,
      );
      let currentPreviewUrl = "";
      for (const entry of webPlan) {
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
        const route = entry.route ?? "/";
        const pageUrl = absolute
          ? route
          : shotCapturePageUrl(
              currentPreviewUrl,
              { ...entry, route },
              captureValidator ?? undefined,
            );
        const page = (await context!.newPage()) as unknown as ShotDriverPage;
        let png: Buffer;
        const warnings: string[] = [];
        try {
          await page.setViewportSize(opts.viewport);
          png = await captureShotPage(
            page,
            pageUrl,
            entry,
            { waitMs: opts.waitMs, fullPage: opts.fullPage },
            {
              onHighlightMiss: (selector, r) => {
                warnings.push(`highlight ${selector} matched nothing on ${r}`);
                console.error(
                  c.yellow("  · ") +
                    `highlight "${selector}" matched nothing on ${r} — capture went ahead unhighlighted`,
                );
              },
              onSelectorMiss: (selector, r) => {
                warnings.push(`selector ${selector} matched nothing on ${r}`);
                console.error(
                  c.yellow("  · ") +
                    `selector "${selector}" matched nothing on ${r} — capture used the whole window`,
                );
              },
              onStepMiss: (message, r) => {
                warnings.push(`${message} on ${r}`);
                console.error(c.yellow("  · ") + `${message} on ${r} — capture went ahead`);
              },
              // #0782: a declared theme the driver could not set — the frame
              // would show the wrong theme, so warn instead of passing silently.
              onThemeMiss: (theme, r) => {
                warnings.push(`theme ${theme} could not be applied on ${r}`);
                console.error(
                  c.yellow("  · ") +
                    `theme "${theme}" could not be applied on ${r} — capture went ahead`,
                );
              },
              // #0866: a state fixture that never rendered, or a target that
              // served its HTML shell for the app, is the wrong screen.
              onStateMiss: (message) => {
                warnings.push(message);
                console.error(c.yellow("  · ") + `${message} — capture went ahead`);
              },
              onRouteNotServed: (message) => {
                warnings.push(message);
                console.error(c.yellow("  · ") + `${message} — capture went ahead`);
              },
            },
          );
        } catch (err) {
          const what = entry.selector ? `selector "${entry.selector}" on ${pageUrl}` : pageUrl;
          console.error(c.red("  ✗ ") + `capture of ${what} failed: ${(err as Error).message}`);
          await page.close();
          return 1;
        }
        await page.close();

        const uploaded = await uploadShot(port, task.id, token, {
          target: entry.target,
          route: route.startsWith("/") ? normalizedRoute(route) : route,
          ...(entry.label ? { label: entry.label } : {}),
          provenance: provenanceCaption(entry.provenance),
          data: png.toString("base64"),
          ...(warnings.length ? { warnings } : {}),
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
            `${entry.target}${entry.highlight ? " · highlighted" : ""}${entry.label ? ` – ${entry.label}` : ""} → ${c.cyan(uploaded.shot.path)} ${c.dim(`(${Math.round(png.length / 1024)} KB)`)}`,
        );
      }
    }

    for (const entry of commandPlan) {
      const target = shotTargetByName(worktreeConfig.shot, entry.target);
      if (!target) {
        console.error(c.red("  ✗ ") + `command capture target "${entry.target}" is not configured`);
        return 1;
      }
      const outputDir = join(
        shotsDir(worktreeRoot, worktreeConfig.workDir, task.id),
        "cmd",
        slugName(entry.target),
      );
      const outcome = runShotCommand(target, worktreeRoot, outputDir, {
        ...(entry.env ? { env: entry.env } : {}),
        ...(entry.args ? { args: entry.args } : {}),
        ...(entry.glob ? { outputGlob: [entry.glob] } : {}),
      });
      if (outcome.status !== "captured") {
        console.error(c.yellow("  · ") + `shots: ${outcome.status} — ${outcome.reason}`);
        continue;
      }
      for (const msg of outcome.warnings) {
        console.error(c.yellow("  · ") + msg);
      }
      for (const file of outcome.files) {
        const uploaded = await uploadShot(port, task.id, token, {
          target: entry.target,
          command: "command",
          ...(entry.label ? { label: entry.label } : {}),
          provenance: provenanceCaption(entry.provenance),
          name: `${entry.target}-${basename(file.name, extname(file.name))}`,
          mime: file.mime,
          data: file.data.toString("base64"),
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
            `${entry.target}${entry.label ? ` – ${entry.label}` : ""} → ${c.cyan(uploaded.shot.path)} ${c.dim(`(${Math.round(file.data.length / 1024)} KB)`)}`,
        );
      }
      // The raw command output is transient — the server now owns the bytes.
      rmSync(outputDir, { recursive: true, force: true });
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
