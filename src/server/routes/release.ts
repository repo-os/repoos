import type { RouteHandler } from "./types.js";
import { json, readBody } from "./utils.js";
import { cutNewRelease, getReleaseStatus, type ReleasePhase } from "../release.js";

export interface ReleaseRun {
  state: "idle" | "running" | "succeeded" | "failed";
  phase: ReleasePhase | null;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
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
  const body = (await readBody(req)) as { version?: unknown; confirmTag?: unknown };
  if (typeof body.version !== "string" || typeof body.confirmTag !== "string")
    return json(res, 400, { error: "version and confirmTag are required" });
  if (run.state === "running")
    return json(res, 409, { error: "A release is already running", run });
  run = {
    state: "running",
    phase: "preparing",
    message: "Starting release…",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  void cutNewRelease(ctx.config, body.version, body.confirmTag, undefined, (phase, message) =>
    updateRun(phase, message),
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
