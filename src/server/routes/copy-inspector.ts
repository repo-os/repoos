import { spawn } from "node:child_process";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  buildEditorSpawnArgs,
  formatCopyInspectorPath,
  hasRepoOsUiSource,
  resolveCopyInspectorTarget,
} from "../../core/copy-inspector.js";
import { isDevBuild } from "../reload.js";

/** Dev/local gate for the inspector API — server's `isDevBuild()` plus RepoOS UI sources. */
export function copyInspectorApiEnabled(root: string): boolean {
  return isDevBuild() && hasRepoOsUiSource(root);
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

  const args = buildEditorSpawnArgs(command, target.absPath, target.line);
  if (!args.length) {
    return json(res, 400, { error: "invalid editor command" });
  }
  const [bin, ...spawnArgs] = args;
  try {
    spawn(bin, spawnArgs, { detached: true, stdio: "ignore" }).unref();
  } catch {
    return json(res, 500, { error: "failed to launch editor" });
  }

  return json(res, 200, {
    ok: true,
    path: formatCopyInspectorPath(target.repoRel, target.line),
  });
};
