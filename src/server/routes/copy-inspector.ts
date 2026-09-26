import { spawn } from "node:child_process";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  buildEditorSpawnArgs,
  copyInspectorUiBuildReady,
  formatCopyInspectorPath,
  resolveCopyInspectorTarget,
} from "../../core/copy-inspector.js";
import { isDevBuild } from "../reload.js";

/**
 * Copy-inspector API gate (#0509): server's `isDevBuild()` plus a dev UI bundle
 * on the managed repo. Release installs never pass `isDevBuild()` even when the
 * repo checkout still has a dev `dist/`.
 */
export function copyInspectorApiEnabled(root: string): boolean {
  if (!isDevBuild()) return false;
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
  const [bin, ...spawnArgs] = args;
  // spawn() reports ENOENT/EACCES asynchronously via "error"; with no listener
  // that becomes an uncaught exception and takes down the server. Wait for
  // "spawn" or "error" so a bad editor command comes back as a 500 instead.
  const launched = await new Promise<boolean>((resolve) => {
    try {
      const child = spawn(bin, spawnArgs, {
        detached: true,
        stdio: "ignore",
        cwd: config.root,
      });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    } catch {
      resolve(false);
    }
  });
  if (!launched) {
    return json(res, 500, { error: "failed to launch editor" });
  }

  return json(res, 200, {
    ok: true,
    path: formatCopyInspectorPath(target.repoRel, target.line),
  });
};
