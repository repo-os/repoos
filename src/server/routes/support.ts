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
import { redactText, RedactionLeakError } from "../../core/redact.js";
import { resolvePmAgent, runPrompt, recordOneShotSession } from "../agents.js";
import { loadBuildInfo } from "./helpers.js";
import { isBun } from "../../core/runtime.js";

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

function bugReportPrompt(
  description: string,
  buildInfo: { version: string | null; buildAt: string | null },
  type: "bug" | "feature",
): string {
  const envLines: string[] = [];
  if (buildInfo.version) envLines.push(`- RepoOS version: ${buildInfo.version}`);
  if (buildInfo.buildAt) envLines.push(`- Built at: ${buildInfo.buildAt}`);
  envLines.push(`- Platform: ${process.platform} ${process.arch}`);
  envLines.push(`- Runtime: ${isBun() ? "bun" : "node"} ${process.version}`);
  const envBlock = envLines.length ? `\nKnown environment:\n${envLines.join("\n")}` : "";

  const isFeature = type === "feature";
  const reportKind = isFeature ? "feature request" : "bug report";
  const sections = isFeature
    ? "## Title, ## Problem to Solve, ## Proposed Change, ## Alternatives Considered, ## Additional Context"
    : "## Title, ## Expected Behavior, ## Actual Behavior, ## Steps to Reproduce, ## Environment, ## Additional Context";
  const kindRules = isFeature
    ? [
        "- Describe the user's problem or opportunity before proposing a solution.",
        "- Do not invent requirements, implementation details, or user impact.",
        "- Under ## Additional Context, include only context supplied by the user.",
      ]
    : [
        "- Keep reproduction steps minimal and actionable.",
        "- Under ## Environment, use the known environment data provided below.",
        "- Under ## Additional Context, optionally suggest attaching an inspected support bundle.",
      ];

  return [
    `You are the RepoOS PM agent. A user is making a ${reportKind}.`,
    `Turn their description into a GitHub-ready ${reportKind}.`,
    "",
    "RULES:",
    "- Generate a concise, descriptive title (under 80 characters).",
    `- Output ONLY valid Markdown with these sections: ${sections}.`,
    "- Use the user's words wherever possible. Do not invent facts or speculate.",
    "- If a section cannot be filled from the description, write <!-- TODO: ... --> with what is needed.",
    "- Never include credentials, API keys, tokens, passwords, repo paths, source code, task bodies, raw logs, or private environment values.",
    ...kindRules,
    "",
    "Known environment:" + envBlock,
    "",
    "---",
    "",
    "User description:",
    description,
  ].join("\n");
}

/**
 * Generate an editable bug report or feature request from a user's notes using
 * the configured PM agent. The report stays entirely local — nothing is uploaded.
 * Attachments are intentionally excluded from the PM input (0463).
 */
export const generateBugReport: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const type = body.type === "feature" ? "feature" : "bug";
  if (!text) return json(res, 400, { error: "text is required" });

  const pm = resolvePmAgent(ctx.config);
  if (!pm) {
    return json(res, 200, {
      ok: false,
      error: "no-pm-agent",
      hint:
        "No PM agent is configured. Go to Settings → Agents to add one, " +
        "or write the report manually and open the GitHub issue form directly.",
    });
  }

  const buildInfo = loadBuildInfo();
  const prompt = bugReportPrompt(redactText(text), buildInfo, type);
  try {
    const result = await runPrompt(pm, prompt, { cwd: ctx.config.root, timeoutMs: 60_000 });
    recordOneShotSession(ctx.config.root, pm, result, { sessionType: "support", taskId: null });
    if (!result.ok || !result.output) {
      return json(res, 200, {
        ok: false,
        error: "generation-failed",
        hint:
          result.error ??
          "The PM agent did not return a response. Try again or write the report manually.",
      });
    }
    // Extract title from the Markdown output (first ## Title line).
    const titleMatch = result.output.match(/^##\s+Title\s*\n\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() ?? text.split("\n")[0].slice(0, 80);
    // Body is the full output minus the title section.
    const bodyStart = titleMatch ? result.output.indexOf(titleMatch[0]) + titleMatch[0].length : 0;
    const body = result.output.slice(bodyStart).trim() || result.output;
    return json(res, 200, { ok: true, title, body });
  } catch (err) {
    return json(res, 200, {
      ok: false,
      error: "generation-failed",
      hint:
        err instanceof Error
          ? err.message
          : "Unknown error. Try again or write the report manually.",
    });
  }
};

function bundleError(res: Parameters<RouteHandler>[2], e: unknown): void {
  if (e instanceof RedactionLeakError) {
    // A redaction miss is a blocker: report the pattern names, never the value.
    json(res, 500, { ok: false, error: e.message, patterns: e.patterns });
    return;
  }
  json(res, 500, { ok: false, error: (e as Error).message });
}
