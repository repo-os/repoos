/**
 * Deterministic plain-language failure analysis for dev targets (#0775).
 *
 * When a target fails, the Dev page used to show only the last few output lines
 * and a raw reason like "process exited with code 1" — the Node stack trace for
 * a port clash, but never the CAUSE. This module turns the captured output into
 * a small, human sentence: what failed, the most likely cause, and how to fix
 * it. It is deliberately deterministic and node-free so it can run in the
 * browser-less core and be unit-tested without spawning anything.
 *
 * The one case it detects today is a port already in use — the exact failure
 * behind the 2026-10-14 Landing page (HMR) report, where `vite --strictPort`
 * died because a stale process still held 5173. The server enriches the result
 * with the PID holding the port (`src/server/dev.ts`); an AI-written summary is
 * an optional extra layered on top, never required for this to work.
 */

/** How many lines of a target's output the page keeps for the last run. */
export const DEV_LOG_MAX_LINES = 2000;

/** The one case we can name with certainty from the output alone. */
export const PORT_IN_USE = "port-in-use";

export interface DevFailure {
  /**
   * Machine id for the detected failure, so the UI can decide what extra
   * affordances to offer (e.g. a Stop button for a port holder).
   */
  kind: typeof PORT_IN_USE | "process-exited" | "unknown";
  /** What failed, in one plain sentence. */
  what: string;
  /** The most likely cause, in one plain sentence. */
  cause: string;
  /** How to fix it, in one plain sentence. */
  fix: string;
  /** The contended port, when the failure is (or looks like) a port clash. */
  port?: number;
}

/** Input the summary is built from — config label plus the target's live state. */
export interface DevFailureInput {
  /** The target's human label, used to name it in the summary. */
  label: string;
  /** The recorded failure reason (state.error), when there is one. */
  error?: string;
  /** The target's combined output (stdout+stderr), newest last. */
  log: readonly string[];
  /**
   * A port the target was configured to use (its resolved `{port}`, or the
   * port in its url). Used only when the output names no port itself.
   */
  portHint?: number;
}

/** A line that proves a port is taken, plus the port when the line names one. */
function matchPortInUse(line: string): { port?: number } | null {
  const lower = line.toLowerCase();
  const eaddrinuse = lower.includes("eaddrinuse");
  const addressInUse = lower.includes("address already in use");
  const portPhrase = /\bport\s+\d{2,5}\b[^.]*\b(?:in use|already in use)\b/.test(lower);
  const bareBind = /\bbind:?\s+address already in use\b/.test(lower);
  if (!eaddrinuse && !addressInUse && !portPhrase && !bareBind) return null;
  const m = line.match(/(?::|port\s+)(\d{2,5})\b/i);
  const port = m ? Number(m[1]) : undefined;
  return { port };
}

/**
 * The port a "port already in use" message refers to, or null when the output
 * shows no such message. Scans the whole captured log so a stack trace split
 * across lines still resolves.
 */
export function detectPortConflict(log: readonly string[]): number | null {
  for (const line of log) {
    const hit = matchPortInUse(line);
    if (hit?.port !== undefined) return hit.port;
  }
  return null;
}

/** Whether any captured line shows a port collision, even without a number. */
export function hasPortInUseLine(log: readonly string[]): boolean {
  return log.some((line) => matchPortInUse(line) !== null);
}

/**
 * Build the deterministic failure summary for a failed target. Always returns a
 * summary: the port case is exact, and everything else gets an honest generic
 * description of the recorded reason rather than a guess presented as fact.
 */
export function failureSummary(input: DevFailureInput): DevFailure {
  const label = input.label || "The target";
  if (hasPortInUseLine(input.log)) {
    const port = detectPortConflict(input.log) ?? input.portHint;
    return {
      kind: PORT_IN_USE,
      what: `${label} could not start: its port is already taken.`,
      cause: port
        ? `Port ${port} is already in use by another process.`
        : "A port the target needs is already in use by another process.",
      fix: port
        ? `Stop the process using port ${port}, then start the target again.`
        : "Stop the process using the port, then start the target again.",
      ...(port !== undefined ? { port } : {}),
    };
  }

  const error = (input.error ?? "").trim();
  if (/could not launch/i.test(error)) {
    return {
      kind: "unknown",
      what: `${label} could not start: the command could not be launched.`,
      cause: "The configured command failed to spawn.",
      fix: "Check that the command exists and the project directory is correct, then start the target again.",
    };
  }
  if (/did not answer|health file|did not appear/i.test(error)) {
    return {
      kind: "unknown",
      what: `${label} started but never became ready.`,
      cause: "The process did not answer its readiness check in time.",
      fix: "Read the full output below — the server may be crashing on startup or listening on a different address.",
    };
  }
  return {
    kind: "process-exited",
    what: `${label} stopped unexpectedly.`,
    cause: error || "The command exited before the target was ready.",
    fix: "Read the full output below for the error, fix it, then start the target again.",
  };
}
