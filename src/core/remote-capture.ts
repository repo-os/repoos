/**
 * The canonical capture context the control plane hands a remote runner (#0854).
 *
 * The runner worker must capture the SAME evidence the control plane would
 * locally, so it cannot re-derive the work from the bundled branch: the branch's
 * `work/<id>.md` can lag the board (a `## Shots` edit made after the branch was
 * cut — the review-16 finding), its `repoos.toml` can lag the live config, and
 * its detached checkout has no base ref to diff changed paths against (so a
 * fallback `/` capture would not resolve the same targets). The server therefore
 * resolves the plan and sends the canonical task data, config slices and the
 * resolved plan entries explicitly; the worker applies them verbatim instead of
 * planning from the bundle.
 *
 * This is data only — no secrets. The task body and the capture-relevant
 * `[preview]`/`[[shot.targets]]` config are the same values the committed
 * `repoos.toml` and `work/*.md` already travel in the bundle; a key that lives
 * in `.env` is never part of either.
 */
import type { PreviewConfig, RepoOSConfig, ShotConfig, Task } from "./types.js";
import type { CaptureEntry } from "./shot-plan.js";

/** The capture plan the control plane resolved, carried so the runner never re-plans. */
export interface CanonicalCapturePlan {
  entries: CaptureEntry[];
  errors: string[];
  /** #0866: declared shots that cannot render on their resolved target. */
  blockingErrors?: string[];
  skips: string[];
  collapsed: string[];
}

/** Canonical inputs the control plane hands a runner (#0854). */
export interface CanonicalCaptureContext {
  /** Canonical task fields the worker must use instead of the bundled branch copy. */
  task?: { body: string; area?: string; areas?: string[] };
  /** Project config slices the worker would otherwise re-read from `repoos.toml`. */
  config?: { preview?: PreviewConfig; shot?: ShotConfig };
  /** The resolved capture plan. Absent for a single-shot request, whose entry IS the plan. */
  plan?: CanonicalCapturePlan;
}

/** The capture-relevant config slices to send with every remote capture request. */
export function captureContextConfig(config: RepoOSConfig): CanonicalCaptureContext["config"] {
  return {
    ...(config.preview ? { preview: config.preview } : {}),
    ...(config.shot ? { shot: config.shot } : {}),
  };
}

/** Build the canonical context from the control plane's live task and config. */
export function canonicalCaptureContext(
  config: RepoOSConfig,
  task: Pick<Task, "body" | "area" | "areas">,
  plan?: CanonicalCapturePlan,
): CanonicalCaptureContext {
  return {
    task: {
      body: task.body ?? "",
      ...(task.area !== undefined ? { area: task.area } : {}),
      ...(task.areas !== undefined ? { areas: task.areas } : {}),
    },
    config: captureContextConfig(config),
    ...(plan ? { plan } : {}),
  };
}

/**
 * Overlay the canonical context on the bundled task/config. Either side may be
 * absent: with no canonical context the bundled values are returned untouched
 * (the pre-#0854 behavior, so an older control plane still works).
 */
export function applyCanonicalCapture(
  base: { config: RepoOSConfig; task: Task },
  canonical: CanonicalCaptureContext | undefined,
): { config: RepoOSConfig; task: Task } {
  if (!canonical) return base;
  const task: Task = canonical.task
    ? {
        ...base.task,
        body: canonical.task.body,
        ...(canonical.task.area !== undefined ? { area: canonical.task.area } : {}),
        ...(canonical.task.areas !== undefined ? { areas: canonical.task.areas } : {}),
      }
    : base.task;
  const config: RepoOSConfig = canonical.config
    ? {
        ...base.config,
        ...(canonical.config.preview ? { preview: canonical.config.preview } : {}),
        ...(canonical.config.shot ? { shot: canonical.config.shot } : {}),
      }
    : base.config;
  return { config, task };
}

/**
 * Parse the canonical context from the runner env, tolerating absence. A present
 * but malformed payload throws so the worker writes a visible setup failure
 * instead of silently planning from a stale bundle.
 */
export function parseCanonicalCaptureContext(
  raw: string | undefined,
): CanonicalCaptureContext | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("remote capture request carried malformed canonical context");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("remote capture request carried an invalid canonical context");
  }
  const value = parsed as CanonicalCaptureContext;
  if (value.task && typeof value.task.body !== "string") {
    throw new Error("remote capture canonical context is missing the task body");
  }
  if (value.plan) {
    if (
      !Array.isArray(value.plan.entries) ||
      !Array.isArray(value.plan.errors) ||
      !Array.isArray(value.plan.skips) ||
      !Array.isArray(value.plan.collapsed)
    ) {
      throw new Error("remote capture canonical context carried an invalid plan");
    }
  }
  return value;
}
