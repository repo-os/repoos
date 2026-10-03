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
  if (!target) {
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
