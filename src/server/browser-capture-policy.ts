import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import type { CanonicalCaptureContext } from "../core/remote-capture.js";
import type { RemoteValidator } from "./remote-validation.js";

export type BrowserCaptureMode = "local" | "runner-available" | "runner-only";
export type BrowserEvidenceOperation = "shots" | "verify" | "both" | "single-shot";
export type BrowserCaptureActivityLevel = "info" | "warn" | "error";

/** Record a completed remote capture in the same task activity surfaces as a local run. */
export function recordBrowserCaptureActivity(
  taskId: string,
  success: boolean,
  message: string,
  log: (taskId: string, level: BrowserCaptureActivityLevel, message: string) => void,
  addTaskNote: (message: string) => void,
): void {
  log(taskId, success ? "info" : "error", message);
  try {
    addTaskNote(message.slice(0, 500));
  } catch {
    // The task log remains available if the durable task note cannot be written.
  }
}

export interface BrowserEvidenceRequest {
  taskId: string;
  worktreePath: string;
  branch: string;
  candidateSha: string;
  operation: BrowserEvidenceOperation;
  entry?: import("../core/shot-plan.js").CaptureEntry & { route: string };
  /**
   * Canonical task/config/plan the worker must use instead of re-deriving them
   * from the bundled branch (#0854). Absent only for legacy callers.
   */
  canonical?: CanonicalCaptureContext;
}

export interface BrowserEvidenceFile {
  /** Only shots/<safe-name>.png, shots/shots.json, or verification.json. */
  name: string;
  data: string;
}

export interface BrowserEvidenceArtifacts {
  version: 1;
  taskId: string;
  ok: boolean;
  detail: string;
  results: Record<string, unknown>;
  files: BrowserEvidenceFile[];
  /** Missing Playwright/WebKit is an availability failure, not a capture failure. */
  browserUnavailable?: boolean;
}

export interface BrowserEvidenceTransport {
  capture(request: BrowserEvidenceRequest): Promise<BrowserEvidenceArtifacts>;
}

const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

/** Adapter over the configured remote validation runner and its artifact channel. */
export function remoteBrowserEvidenceTransport(
  config: RepoOSConfig,
  validator: RemoteValidator | undefined,
): BrowserEvidenceTransport | undefined {
  if (!validator || config.remoteValidation?.enabled !== true) return undefined;
  return {
    async capture(request) {
      const artifactRoot = join(
        config.root,
        ".repoos",
        "logs",
        "remote-validation",
        request.taskId,
        "browser-capture",
      );
      rmSync(artifactRoot, { recursive: true, force: true });
      const summary = await validator.validate({
        taskId: request.taskId,
        worktreePath: request.worktreePath,
        candidateSha: request.candidateSha,
        phase: "pre-review",
        browserCapture: {
          taskId: request.taskId,
          branch: request.branch,
          operation: request.operation,
          ...(request.entry ? { entry: request.entry } : {}),
          ...(request.canonical ? { canonical: request.canonical } : {}),
        },
      });
      const resultPath = join(artifactRoot, "result.json");
      if (!existsSync(resultPath)) {
        const detail =
          summary.detail ?? summary.output ?? "runner did not return capture artifacts";
        if (
          /playwright|webkit|browser executable|executable doesn.t exist|not installed/i.test(
            detail,
          )
        ) {
          throw new BrowserEvidenceUnavailableError(detail, true);
        }
        throw new BrowserEvidenceUnavailableError(detail);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFileSync(resultPath, "utf8"));
      } catch {
        throw new BrowserEvidenceUnavailableError("runner returned malformed browser artifacts");
      }
      const artifacts = validateBrowserEvidenceArtifacts(parsed, request.taskId);
      if (!artifacts) {
        throw new BrowserEvidenceUnavailableError("runner returned invalid browser artifacts");
      }
      return artifacts;
    },
  };
}

export function validateBrowserEvidenceArtifacts(
  value: unknown,
  expectedTaskId: string,
): BrowserEvidenceArtifacts | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<BrowserEvidenceArtifacts>;
  if (
    raw.version !== 1 ||
    raw.taskId !== expectedTaskId ||
    typeof raw.ok !== "boolean" ||
    typeof raw.detail !== "string" ||
    !raw.results ||
    typeof raw.results !== "object" ||
    !Array.isArray(raw.files)
  )
    return null;
  let total = 0;
  const files: BrowserEvidenceFile[] = [];
  for (const file of raw.files) {
    if (!file || typeof file !== "object") return null;
    const entry = file as BrowserEvidenceFile;
    if (
      typeof entry.name !== "string" ||
      !/^(?:shots\/[A-Za-z0-9._-]+\.png|shots\/shots\.json|verification\.json)$/.test(entry.name) ||
      typeof entry.data !== "string" ||
      entry.data.length > (MAX_ARTIFACT_BYTES * 4) / 3 + 8
    )
      return null;
    const bytes = Buffer.from(entry.data, "base64");
    if (!bytes.length || bytes.toString("base64") !== entry.data) return null;
    if (
      entry.name.endsWith(".png") &&
      !(bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === "PNG")
    )
      return null;
    total += bytes.length;
    if (total > MAX_ARTIFACT_BYTES) return null;
    files.push({ name: entry.name, data: entry.data });
  }
  return {
    version: 1,
    taskId: raw.taskId,
    ok: raw.ok,
    detail: raw.detail,
    results: raw.results as Record<string, unknown>,
    files,
    ...(raw.browserUnavailable ? { browserUnavailable: true } : {}),
  };
}

export class BrowserEvidenceUnavailableError extends Error {
  readonly browserUnavailable: boolean;

  constructor(message: string, browserUnavailable = false) {
    super(message);
    this.name = "BrowserEvidenceUnavailableError";
    this.browserUnavailable = browserUnavailable;
  }
}

export interface BrowserCapturePolicyOptions<T> {
  config: RepoOSConfig;
  request: BrowserEvidenceRequest;
  transport?: BrowserEvidenceTransport;
  local: () => Promise<T>;
  useArtifacts: (artifacts: BrowserEvidenceArtifacts) => Promise<T>;
  note: (message: string) => void;
}

/** Apply the configured local/runner/fallback policy to a browser evidence job. */
export async function runBrowserCaptureWithPolicy<T>(
  options: BrowserCapturePolicyOptions<T>,
): Promise<T> {
  const mode: BrowserCaptureMode = options.config.remoteValidation?.browserCaptureMode ?? "local";
  if (mode === "local") return options.local();

  const disabled = options.config.remoteValidation?.enabled !== true;
  const transport = disabled ? undefined : options.transport;
  let failure: unknown;
  let returnedArtifacts: BrowserEvidenceArtifacts | undefined;
  if (transport) {
    try {
      const artifacts = await transport.capture(options.request);
      if (artifacts.browserUnavailable) {
        failure = new BrowserEvidenceUnavailableError(artifacts.detail, true);
      } else if (!artifacts.ok && typeof artifacts.results.error === "string") {
        failure = new Error(artifacts.results.error);
      } else {
        returnedArtifacts = artifacts;
      }
    } catch (error) {
      failure = error;
    }
  } else {
    failure = new BrowserEvidenceUnavailableError(
      disabled
        ? "remote validation is disabled"
        : "no remote browser capture transport is available",
    );
  }

  if (returnedArtifacts) {
    if (!returnedArtifacts.ok) {
      // A valid capture result with ok=false is a real UI/declared-shot failure.
      // Preserve it exactly; infra fallback must never mask a missing target.
      return options.useArtifacts(returnedArtifacts);
    }
    // The runner reported success, but INSTALLING its artifacts can still fail:
    // a malformed `shots.json`, or a manifest entry whose PNG is missing. That
    // is a runner-side failure like any other — fall back locally where the mode
    // allows it, and only surface it in runner-only mode.
    try {
      return await options.useArtifacts(returnedArtifacts);
    } catch (error) {
      failure = error;
    }
  }

  const detail = failure instanceof Error ? failure.message : String(failure);
  if (mode === "runner-only") {
    throw new BrowserEvidenceUnavailableError(`runner-only browser capture failed: ${detail}`);
  }
  const note = `remote browser capture unavailable (${detail}); falling back to local capture`;
  options.note(note);
  return options.local();
}
