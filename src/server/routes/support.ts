import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  buildSupportBundle,
  bundlePathWarning,
  defaultBundlePath,
  serializeSupportBundle,
  type SupportBundle,
} from "../../core/support-bundle.js";
import { RedactionLeakError } from "../../core/redact.js";

/**
 * Build the bundle in memory and report exactly what it would contain and
 * where it would be written — the UI shows this before the user confirms.
 */
export const getSupportBundlePreview: RouteHandler = async (ctx, _req, res) => {
  try {
    const bundle = await buildSupportBundle({ root: ctx.config.root });
    const out = bundlePath(bundle);
    return json(res, 200, {
      ok: true,
      dryRun: true,
      path: out,
      warning: bundlePathWarning(out, bundle.root),
      manifest: bundle.manifest,
    });
  } catch (e) {
    return bundleError(res, e);
  }
};

/**
 * Build and write the redacted bundle. The archive stays on this machine; the
 * response only contains the manifest and the local path. Nothing is uploaded.
 */
export const createSupportBundle: RouteHandler = async (ctx, _req, res) => {
  try {
    const bundle = await buildSupportBundle({ root: ctx.config.root });
    const out = bundlePath(bundle);
    const buffer = serializeSupportBundle(bundle);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buffer);
    return json(res, 200, {
      ok: true,
      dryRun: false,
      path: out,
      bytes: buffer.length,
      warning: bundlePathWarning(out, bundle.root),
      manifest: bundle.manifest,
    });
  } catch (e) {
    return bundleError(res, e);
  }
};

/**
 * Reveal an existing support archive in the machine's file browser. The
 * browser supplies a path, but the server only ever opens a real archive
 * directly below this repo's own `.repoos/support/` directory.
 */
export const revealSupportBundle: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as { path?: unknown };
  if (typeof body.path !== "string" || !body.path.trim()) {
    return json(res, 400, { error: "support bundle path is required" });
  }

  const out = resolve(body.path);
  const supportDir = resolve(ctx.config.root, ctx.config.cacheDir, "support");
  const relativePath = relative(supportDir, out);
  const isDirectSupportArchive =
    relativePath !== "" &&
    !relativePath.startsWith(`..${sep}`) &&
    relativePath !== ".." &&
    !isAbsolute(relativePath) &&
    dirname(out) === supportDir &&
    /^repoos-support-.+\.tar\.gz$/.test(basename(out));

  if (!isDirectSupportArchive) {
    return json(res, 404, { error: "support bundle was not found in this repo" });
  }

  let isFile = false;
  try {
    isFile = existsSync(out) && statSync(out).isFile();
  } catch {
    // The file may disappear between the existence check and inspection.
  }
  if (!isFile) {
    return json(res, 404, { error: "support bundle was not found in this repo" });
  }

  try {
    await revealInFileBrowser(out, supportDir);
    return json(res, 200, { ok: true });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return json(res, 500, { error: `could not open the file browser: ${detail}` });
  }
};

function revealInFileBrowser(file: string, directory: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", ["-R", file]]
      : process.platform === "win32"
        ? ["explorer.exe", [`/select,${file}`]]
        : ["xdg-open", [directory]];

  return new Promise((resolveReveal, rejectReveal) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", rejectReveal);
    child.once("spawn", () => {
      child.unref();
      resolveReveal();
    });
  });
}

function bundlePath(bundle: SupportBundle): string {
  return defaultBundlePath(bundle.root, bundle.cacheDir, new Date(bundle.report.generatedAt));
}

function bundleError(res: Parameters<RouteHandler>[2], e: unknown): void {
  if (e instanceof RedactionLeakError) {
    // A redaction miss is a blocker: report the pattern names, never the value.
    json(res, 500, { ok: false, error: e.message, patterns: e.patterns });
    return;
  }
  json(res, 500, { ok: false, error: (e as Error).message });
}
