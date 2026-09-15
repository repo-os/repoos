import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import {
  collectReleaseCommits,
  cutNewRelease,
  getReleaseStatus,
  releaseNotesPrompt,
  type ReleasePhase,
} from "../release.js";
import {
  extractOneShotReportText,
  pmCommand,
  recordOneShotSession,
  resolveEngineer,
  resolvePmAgent,
  runPrompt,
} from "../agents.js";
import type { Agent, RepoOSConfig } from "../../core/types.js";

export interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: ReleasePhase | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
}

/**
 * Which agent drafts release notes. The PM owns authoring, so prefer it; fall
 * back to the engineer when a repo has the PM disabled. Null means neither is
 * enabled and the generate button should report that rather than fail opaquely.
 */
function releaseNotesAgent(config: RepoOSConfig): Agent | null {
  return resolvePmAgent(config) ?? resolveEngineer(config);
}

let run: ReleaseRun = { state: "idle", phase: null, message: "", startedAt: null, updatedAt: null };

function updateRun(
  phase: ReleasePhase | null,
  message: string,
  state: ReleaseRun["state"] = "running",
): void {
  run = {
    state,
    phase,
    message,
    startedAt: run.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export const getRelease: RouteHandler = async (ctx, _req, res) =>
  json(res, 200, await getReleaseStatus(ctx.config));

export const getReleaseRun: RouteHandler = (_ctx, _req, res) => json(res, 200, run);

export const runRelease: RouteHandler = async (ctx, req, res) => {
  const body = (await readBody(req)) as {
    version?: unknown;
    confirmTag?: unknown;
    notes?: unknown;
  };
  if (typeof body.version !== "string" || typeof body.confirmTag !== "string")
    return json(res, 400, { error: "version and confirmTag are required" });
  if (run.state === "running")
    return json(res, 409, { error: "A release is already running", run });
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes : undefined;
  run = {
    state: "running",
    phase: "preparing",
    message: "Starting release…",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  void cutNewRelease(
    ctx.config,
    body.version,
    body.confirmTag,
    undefined,
    (phase, message) => updateRun(phase, message),
    ctx.remoteValidator,
    notes,
  )
    // Keep the phase that was in flight when it failed, so the UI can say
    // "failed during checking" rather than a bare "failed".
    .then((result) =>
      updateRun(result.ok ? null : run.phase, result.output, result.ok ? "succeeded" : "failed"),
    )
    .catch(() =>
      updateRun(
        null,
        "Release runner stopped unexpectedly. Check the repository state before retrying.",
        "failed",
      ),
    );
  return json(res, 202, { ok: true, run });
};

/**
 * Draft release notes from the commits since the last release (full history
 * when there is none) with the repo's one-shot LLM plumbing. This never cuts a
 * release — it only returns text for the modal to drop into its optional notes
 * field, where the operator can edit it before confirming the cut. A failure
 * here is reported to the caller and has no effect on the cut flow.
 */
export const generateReleaseNotes: RouteHandler = async (ctx, req, res) => {
  const { config } = ctx;
  const body = (await readBody(req)) as { version?: unknown };
  const version = typeof body.version === "string" && body.version.trim() ? body.version : null;

  const agent = releaseNotesAgent(config);
  if (!agent) {
    return json(res, 400, {
      error: "No agent is enabled to draft release notes — enable the PM or Engineer agent.",
    });
  }

  const { commits, sinceTag, truncated } = await collectReleaseCommits(config);
  if (!commits.length) {
    // Nothing new to summarize is not an error: the cut can still proceed.
    return json(res, 200, { notes: "", sinceTag, commitCount: 0, truncated });
  }

  const prompt = releaseNotesPrompt(commits, { sinceTag, version, truncated });
  const result = await runPrompt(agent, prompt, {
    cwd: config.root,
    // Structured output so extractUsage records real tokens/cost for this
    // board-level call (house rule: every one-shot LLM call is recorded).
    command: pmCommand(agent, prompt, config.root),
  });
  recordOneShotSession(config.root, agent, result, {
    sessionType: "release-notes",
    taskId: null,
  });

  if (!result.ok || !result.output) {
    return json(res, 502, { error: result.error ?? "The agent returned no release notes." });
  }
  const notes = extractOneShotReportText(agent.cli, result.output);
  if (!notes) {
    return json(res, 502, { error: "The agent returned no usable release notes." });
  }
  return json(res, 200, { notes, sinceTag, commitCount: commits.length, truncated });
};
