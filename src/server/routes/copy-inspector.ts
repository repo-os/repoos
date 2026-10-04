import { spawn } from "node:child_process";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  buildEditorSpawnArgs,
  copyInspectorUiBuildReady,
  formatCopyInspectorPath,
  resolveCopyInspectorTarget,
  resolveRepoFileTarget,
} from "../../core/copy-inspector.js";
import { isTaskFilePath } from "../../core/task.js";

/**
 * Copy-inspector API gate (#0509): the managed repo must have RepoOS UI sources
 * and a dev UI bundle (`devUi` in `dist/.build-info.json`, i.e. built without
 * `REPOOS_SHIP=1`). That is the real "not for released installs" boundary:
 * npm/curl/brew builds ship without `data-repoos-*` annotations and without
 * `src/`. Deliberately not tied to running from `src/` — the dogfood server
 * and task previews run the compiled `dist/cli/index.js`.
 */
export function copyInspectorApiEnabled(root: string): boolean {
  return copyInspectorUiBuildReady(root);
}

export const postCopyInspectorOpen: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  if (!copyInspectorApiEnabled(config.root)) {
    return json(res, 404, { error: "not available" });
  }

  if (config.dev?.inspector?.enabled === false) {
    return json(res, 400, { error: "copy inspector is disabled" });
  }
  const command =
    typeof config.dev?.inspector?.editorCommand === "string"
      ? config.dev.inspector.editorCommand.trim()
      : "";
  if (!command) {
    return json(res, 400, { error: "no editor command configured" });
  }

  const body = (await readBody(req)) as { file?: unknown; line?: unknown };
  const file = typeof body.file === "string" ? body.file : "";
  const lineRaw = body.line;
  const line =
    typeof lineRaw === "number"
      ? lineRaw
      : typeof lineRaw === "string" && /^\d+$/.test(lineRaw)
        ? Number(lineRaw)
        : null;
  const target = resolveCopyInspectorTarget(config.root, file, line);
  if (!target) {
    return json(res, 400, { error: "invalid file path" });
  }

  const args = buildEditorSpawnArgs(command, target.repoRel, target.line);
  if (!args.length) {
    return json(res, 400, { error: "invalid editor command" });
  }
  const launched = await spawnDetached(args, config.root);
  if (!launched) {
    return json(res, 500, { error: "failed to launch editor" });
  }

  return json(res, 200, {
    ok: true,
    path: formatCopyInspectorPath(target.repoRel, target.line),
  });
};

/**
 * The task detail page's "Open in editor" link (#0636): open a task's own
 * markdown file (under `work/`) in the editor configured for the copy
 * inspector. Reuses the same gate + `dev.inspector.editorCommand`, but resolves
 * a general repo-relative file instead of only `src/` sources.
 */
export const postOpenInEditor: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  if (!copyInspectorApiEnabled(config.root)) {
    return json(res, 404, { error: "not available" });
  }
  if (config.dev?.inspector?.enabled === false) {
    return json(res, 400, { error: "editor is disabled" });
  }
  const command =
    typeof config.dev?.inspector?.editorCommand === "string"
      ? config.dev.inspector.editorCommand.trim()
      : "";
  if (!command) {
    return json(res, 400, { error: "no editor command configured" });
  }

  const body = (await readBody(req)) as { file?: unknown };
  const file = typeof body.file === "string" ? body.file : "";
  const target = resolveRepoFileTarget(config.root, file);
  // Scope the endpoint to task markdown under the configured work dir. The UI
  // only ever sends `task.path`, but the route is reachable directly, so an
  // arbitrary repo file (`.env`, a source file) must be refused here — not just
  // left to the caller (#0636 review). `resolveRepoFileTarget` already
  // realpath-resolves, so a symlink out of the repo is rejected before this.
  if (
    !target ||
    !isTaskFilePath(config.workDir, target.repoRel, config.taskExtensions ?? [".md"])
  ) {
    return json(res, 400, { error: "invalid file path" });
  }

  const args = buildEditorSpawnArgs(command, target.repoRel, null);
  if (!args.length) {
    return json(res, 400, { error: "invalid editor command" });
  }
  const launched = await spawnDetached(args, config.root);
  if (!launched) {
    return json(res, 500, { error: "failed to launch editor" });
  }

  return json(res, 200, { ok: true, path: target.repoRel });
};

/**
 * "Open failed test" on the Checks page and the release failure panel: open a
 * test file from a stored failed-test name (`file > suite > test`) in the
 * configured editor. Vitest names the file relative to its project root
 * (`src/ui-app`), so a few repo-relative candidates are tried. Scoped to
 * `*.test.*` / `*.spec.*` files so the route can't open arbitrary repo files.
 */
export const postOpenTestInEditor: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  if (!copyInspectorApiEnabled(config.root)) {
    return json(res, 404, { error: "not available" });
  }
  if (config.dev?.inspector?.enabled === false) {
    return json(res, 400, { error: "editor is disabled" });
  }
  const command =
    typeof config.dev?.inspector?.editorCommand === "string"
      ? config.dev.inspector.editorCommand.trim()
      : "";
  if (!command) {
    return json(res, 400, { error: "no editor command configured" });
  }

  const body = (await readBody(req)) as { test?: unknown };
  const test = typeof body.test === "string" ? body.test : "";
  const file = (test.split(" > ")[0] ?? "").trim().replace(/:\d+(?::\d+)?$/, "");
  if (!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) {
    return json(res, 400, { error: "not a test file" });
  }
  let target: { absPath: string; repoRel: string } | null = null;
  for (const prefix of ["", "src/ui-app/", "src/"]) {
    target = resolveRepoFileTarget(config.root, prefix + file);
    if (target) break;
  }
  if (!target) return json(res, 404, { error: "test file not found" });

  const args = buildEditorSpawnArgs(command, target.repoRel, null);
  if (!args.length) {
    return json(res, 400, { error: "invalid editor command" });
  }
  const launched = await spawnDetached(args, config.root);
  if (!launched) {
    return json(res, 500, { error: "failed to launch editor" });
  }
  return json(res, 200, { ok: true, path: target.repoRel });
};

/**
 * Spawn an already-built editor argv detached. Returns false when the binary
 * cannot be launched; never throws, because an unhandled `error` event on a
 * detached child would otherwise take down the server.
 */
async function spawnDetached(args: string[], root: string): Promise<boolean> {
  const [bin, ...spawnArgs] = args;
  return new Promise<boolean>((resolveSpawn) => {
    try {
      const child = spawn(bin, spawnArgs, {
        detached: true,
        stdio: "ignore",
        cwd: root,
      });
      child.once("error", () => resolveSpawn(false));
      child.once("spawn", () => {
        child.unref();
        resolveSpawn(true);
      });
    } catch {
      resolveSpawn(false);
    }
  });
}
