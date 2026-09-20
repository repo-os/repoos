import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RouteHandler } from "./types.js";
import { json } from "./utils.js";
import {
  buildSupportBundle,
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
    return json(res, 200, {
      ok: true,
      dryRun: true,
      path: bundlePath(bundle),
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
      manifest: bundle.manifest,
    });
  } catch (e) {
    return bundleError(res, e);
  }
};

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
