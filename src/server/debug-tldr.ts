/**
 * The failure tl;dr (#0570): when a task enters a diagnosable failure state
 * (`review-failed`, `dev-error`, `check-failed-after-retries`,
 * `watchdog-stuck`), the task's Debugger agent runs ONCE as a one-shot call
 * and distills the raw failure text into a single plain-language sentence —
 * root cause + concrete next action — persisted on the task as `debug_tldr`
 * and rendered as a callout the user can't miss above the drawer's tabs.
 *
 * The lifecycle deliberately mirrors `skill-suggestions.ts` (one-shot
 * task-scoped agent run, gated on enabled + not-in-flight, recording usage,
 * storing its result on the task):
 *
 *   - Best-effort and asynchronous: the trigger sites call fire-and-forget, so
 *     a slow, failed, or timed-out run never blocks the failure transition,
 *     the banner, or the actions around it. A failed run yields no tl;dr and
 *     leaves today's behavior intact.
 *   - Deduped: at most one run in flight per task, and no regeneration while
 *     the persisted tl;dr still describes the same `(reason, detail)` failure
 *     (fingerprinted into `debug_tldr_key`, which survives restarts).
 *   - Escalations that are questions, not errors (`cto-escalation`,
 *     `questions`, `underspecified`, `review-rounds-exhausted`) are excluded —
 *     there is no failure to diagnose.
 *
 * Persistence rides the same invariant as `needs_input_reason`: `serializeTask`
 * only writes the `debug_tldr*` keys while `needsInput` is true, so every
 * clear path (dismiss, review-again, status advance, release) drops the
 * sentence with the failure it describes — no clear-site has to remember.
 *
 * Zero runtime deps — node:fs only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../core/types.js";
import type { LogEntry, Logger } from "../core/logger.js";
import { parseTask, serializeTask, utcTimestamp } from "../core/task.js";
import { commitTaskFile } from "../core/git.js";
import { transcriptToText } from "./skill-suggestions.js";
import { redactSecrets } from "./routes/debugger.js";
import {
  extractOneShotReportText,
  debuggerAgent,
  recordOneShotSession,
  runPrompt,
  type PromptResult,
} from "./agents.js";

/** The needs-input reasons a Debugger run can actually diagnose. */
export const DIAGNOSABLE_REASONS = [
  "review-failed",
  "dev-error",
  "check-failed-after-retries",
  "watchdog-stuck",
] as const;
export type DiagnosableReason = (typeof DIAGNOSABLE_REASONS)[number];

export function isDiagnosableReason(reason: string | undefined): reason is DiagnosableReason {
  return typeof reason === "string" && (DIAGNOSABLE_REASONS as readonly string[]).includes(reason);
}

/** Cap on the failure detail quoted into the prompt. */
const DETAIL_CHARS = 1200;
/** Cap on the log excerpt quoted into the prompt (newest lines first). */
const LOG_CHARS = 4000;
/** Cap on the transcript excerpt quoted into the prompt (tail — where the failure is). */
const TRANSCRIPT_CHARS = 6000;
/** Hard cap on the persisted sentence; the prompt targets ≤ ~140 chars. */
const TLDR_MAX_CHARS = 280;

/** Where a given failure's most useful transcript lives, or null when logs alone carry it. */
function transcriptSessionIdFor(reason: DiagnosableReason, taskId: string): string | null {
  switch (reason) {
    // The reviewer produced no report: its own transcript ends with the crash.
    case "review-failed":
      return `review:${taskId}`;
    // The engineer's turn died / failed checks during handoff: the engineer
    // transcript (plus the task logs) carries the failure.
    case "dev-error":
    case "check-failed-after-retries":
      return taskId;
    // Nothing ran — logs are all there is.
    case "watchdog-stuck":
      return null;
  }
}

/** Stable fingerprint of the failure a tl;dr describes, for dedupe. */
export function tldrFingerprint(reason: string, detail: string | undefined): string {
  return `${reason}\u0000${detail ?? ""}`;
}

/**
 * The mission handed to the Debugger: one sentence, root cause + next action,
 * no preamble, no markdown, no restated logs.
 */
export function buildDebugTldrPrompt(
  task: Pick<Task, "id" | "title">,
  reason: DiagnosableReason,
  detail: string | undefined,
  excerpt: string,
): string {
  const detailBlock = detail?.trim() ? detail.trim().slice(0, DETAIL_CHARS) : "(none captured)";
  return [
    `You are the Debugger for RepoOS task #${task.id} ("${task.title}"). An agent run on`,
    "this task just failed and the human is looking at raw logs. Write the ONE-LINE",
    "tl;dr for the failure banner.",
    "",
    "Answer with EXACTLY ONE sentence of plain text and nothing else: no markdown,",
    "no quotes, no preamble, no bullet points, no restating raw log text. The",
    "sentence must name the root cause and the concrete next action, e.g.:",
    '"Review agent ran out of credits — choose a different reviewer agent and try again."',
    "Keep it under 140 characters. If the excerpts leave the cause uncertain, give",
    "the most probable cause and a safe next action (e.g. what to open or retry).",
    "",
    `Failure reason: ${reason}`,
    `Failure detail: ${detailBlock}`,
    "",
    "Recent task logs (newest first, secrets redacted):",
    excerpt,
  ].join("\n");
}

/**
 * Normalize the model's answer into the one sentence we persist: drop the
 * one-shot framing, take the first non-empty line, strip wrapping quotes and
 * a "tl;dr:"-style prefix, collapse whitespace, and hard-cap the length.
 * Returns null when nothing usable came back.
 *
 * `cli` is the Debugger's own (user-overridable) CLI: the one-shot output is
 * parsed with that CLI's stream format, and the fallback-to-raw-JSON failure
 * mode of a mismatched parser is exactly what turns a JSON line into the
 * persisted "sentence".
 */
export function sanitizeTldrAnswer(cli: string, raw: string): string | null {
  const report = extractOneShotReportText(cli, raw);
  const firstLine =
    report
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? "";
  let line = firstLine.replace(/^(?:tl;?dr|tldr)\s*[:—-]\s*/i, "");
  line = line
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!line) return null;
  if (line.length > TLDR_MAX_CHARS) line = `${line.slice(0, TLDR_MAX_CHARS - 1).trimEnd()}…`;
  return line;
}

/** What the manager needs; all side effects injected so trigger sites stay one-liners. */
export interface DebugTldrDeps {
  config: RepoOSConfig;
  /** Resolve the task from the live index (fresher than a trigger site's copy). */
  getTask: (taskId: string) => Task | null;
  /** Render a persisted agent session's lines (engineer, reviewer, …). */
  getTranscript: (sessionId: string) => AgentOutputEntry[];
  /** The task's own log stream (newest first). */
  getTaskLogs: (taskId: string, limit: number) => LogEntry[];
  /** Push a persisted task-file change into the live index so SSE streams it. */
  onTaskFileChanged: (absPath: string) => void;
  /** SSE markers for the drawer's "diagnosing…" hint (started → finished). */
  onDiagnosisStarted?: (taskId: string) => void;
  onDiagnosisFinished?: (taskId: string) => void;
  logger?: Logger;
  /** Injectable one-shot runner; defaults to the real `runPrompt`. */
  run?: (agent: Agent, prompt: string, cwd: string) => Promise<PromptResult>;
}

export interface DebugTldrRunResult {
  ok: boolean;
  tldr?: string;
  reason?: string;
}

/**
 * Runs the failure tl;dr pass. All side effects are injected so the trigger
 * sites stay a one-liner and the logic is unit-testable.
 */
export class DebugTldrManager {
  private readonly deps: DebugTldrDeps;
  /** Tasks with a diagnosis in flight, so a re-entrant event doesn't double-run. */
  private readonly inFlight = new Set<string>();

  constructor(deps: DebugTldrDeps) {
    this.deps = deps;
  }

  /** The Debugger's enabled state — the Agents page toggle. */
  private enabled(): boolean {
    return Boolean(this.deps.config.builtInAgents?.debugger?.enabled);
  }

  /**
   * Fire-and-forget entry point used by the failure sites. Never throws and
   * never blocks: the failure transition that triggered it is already done.
   *
   * Only the reason comes from the trigger; the failure's fingerprint and
   * prompt context are derived from the freshly-parsed task, which is
   * authoritative — e.g. the watchdog escalation carries its detail in the
   * Activity log, not in `needs_input_detail`, so trigger-site args would not
   * match what the post-generation write gate re-verifies.
   */
  onFailureEscalated(taskId: string, reason: string): void {
    if (!isDiagnosableReason(reason)) return;
    void this.run(taskId, reason).catch((err) => {
      this.deps.logger?.task(taskId, "warn", "debug tl;dr pass threw", {
        error: (err as Error).message,
      });
    });
  }

  /**
   * Run one pass. Never throws for expected conditions — returns
   * `{ ok: false, reason }` instead. The result exists for tests and
   * diagnostics; the feature is silent by design.
   *
   * All state gates read the task FILE, not the index: the trigger sites write
   * synchronously but mostly propagate through the async file watcher (only
   * the watchdog calls `applyFileChange` inline), so the index copy can lag
   * the escalation this pass was triggered by. The on-disk frontmatter is the
   * authority for whether the failure is still current — and for the
   * `(reason, detail)` fingerprint the write gate re-verifies.
   */
  async run(taskId: string, reason: DiagnosableReason): Promise<DebugTldrRunResult> {
    if (!this.enabled()) return { ok: false, reason: "debugger disabled" };
    const absPath = this.deps.getTask(taskId)?.absPath;
    if (!absPath) return { ok: false, reason: "task not found" };
    const task = this.readTaskFromDisk(absPath);
    if (!task) return { ok: false, reason: "task unreadable" };
    if (!task.needsInput || task.needsInputReason !== reason) {
      return { ok: false, reason: "failure no longer current" };
    }
    const detail = task.needsInputDetail;
    const fingerprint = tldrFingerprint(reason, detail);
    if (task.debugTldrKey === fingerprint) return { ok: false, reason: "tl;dr already current" };
    if (this.inFlight.has(taskId)) return { ok: false, reason: "already running" };

    const agent = debuggerAgent(fromPersistedState(this.deps.config));
    this.inFlight.add(taskId);
    this.deps.onDiagnosisStarted?.(taskId);
    try {
      const excerpt = this.buildExcerpt(taskId, reason);
      // The detail is part of the failure context the model sees, so it goes
      // through the same redaction as the excerpts. Redact BEFORE slicing so a
      // secret can't survive by sitting past a length cut. The fingerprint
      // stays keyed on the raw detail — it identifies the on-disk failure.
      const detailForPrompt = detail ? redactSecrets(detail).slice(0, DETAIL_CHARS) : undefined;
      const prompt = buildDebugTldrPrompt(task, reason, detailForPrompt, excerpt);
      const run = this.deps.run ?? ((a: Agent, p: string, cwd: string) => runPrompt(a, p, { cwd }));
      const result = await run(agent, prompt, this.deps.config.root);
      // Every LLM call must record its usage, even on failure.
      recordOneShotSession(this.deps.config.root, agent, result, {
        sessionType: "debugger",
        taskId,
      });
      if (!result.ok) return { ok: false, reason: result.error ?? "diagnosis failed" };

      const sentence = sanitizeTldrAnswer(agent.cli, result.output ?? "");
      if (!sentence) return { ok: false, reason: "empty answer" };
      return this.persist(absPath, fingerprint, sentence);
    } finally {
      this.inFlight.delete(taskId);
      this.deps.onDiagnosisFinished?.(taskId);
    }
  }

  /** Parse the task file fresh from disk; null when unreadable. */
  private readTaskFromDisk(absPath: string): Task | null {
    try {
      return parseTask({
        content: readFileSync(absPath, "utf8"),
        absPath,
        root: this.deps.config.root,
        defaultStatus: this.deps.config.defaultStatus,
        defaultAssignee: this.deps.config.defaultAssignee,
      });
    } catch {
      return null;
    }
  }

  /**
   * Re-read the task right before writing and verify the failure this tl;dr
   * describes is STILL the current one — the human may have dismissed the
   * flag, started a fresh review, or hit a different failure while the model
   * ran. Only then persist, commit, and surface through the live index.
   */
  private persist(absPath: string, fingerprint: string, sentence: string): DebugTldrRunResult {
    const current = this.readTaskFromDisk(absPath);
    if (!current) return { ok: false, reason: "task unreadable" };
    if (
      !current.needsInput ||
      !isDiagnosableReason(current.needsInputReason) ||
      tldrFingerprint(current.needsInputReason, current.needsInputDetail) !== fingerprint
    ) {
      return { ok: false, reason: "failure cleared while diagnosing" };
    }
    current.debugTldr = sentence;
    current.debugTldrAt = utcTimestamp();
    current.debugTldrKey = fingerprint;
    // Stamping updated_at (not an activity entry) is enough: the sentence lives
    // in frontmatter, and the live-index update below streams it to the drawer.
    current.updated_at = utcTimestamp();
    try {
      writeFileSync(current.absPath, serializeTask(current));
      commitTaskFile(
        this.deps.config.root,
        current.absPath,
        `docs(${current.id}): add debug tl;dr`,
      );
      this.deps.onTaskFileChanged(current.absPath);
    } catch (err) {
      this.deps.logger?.task(current.id, "warn", "debug tl;dr could not be persisted", {
        error: (err as Error).message,
      });
      return { ok: false, reason: "persist failed" };
    }
    this.deps.logger?.task(current.id, "info", "debug tl;dr generated", { tldr: sentence });
    return { ok: true, tldr: sentence };
  }

  /**
   * Bounded, redacted failure context: the task's recent logs plus — when the
   * reason has one — the tail of the transcript that actually failed. The
   * reviewer's crash text (the canonical "out of credits" case) sits at the
   * end of its transcript, so the tail is the informative part.
   */
  private buildExcerpt(taskId: string, reason: DiagnosableReason): string {
    const parts: string[] = [];
    const logs = this.deps.getTaskLogs(taskId, 40);
    if (logs.length) {
      // Redact BEFORE slicing so a secret can never straddle a cut boundary,
      // then slice from the HEAD: getTaskLogs is newest-first, so keeping the
      // head keeps the freshest lines — the ones around the failure — and
      // matches the prompt's "newest first" label.
      const joined = redactSecrets(
        logs.map((l) => `[${l.timestamp}] ${l.level}: ${l.message}`).join("\n"),
      );
      parts.push(joined.slice(0, LOG_CHARS));
    }
    const sessionId = transcriptSessionIdFor(reason, taskId);
    if (sessionId) {
      // transcriptToText is chronological, so the failure sits at the END:
      // this part keeps the tail.
      const transcript = transcriptToText(this.deps.getTranscript(sessionId));
      if (transcript) {
        parts.push(
          `Session transcript tail:\n${redactSecrets(transcript).slice(-TRANSCRIPT_CHARS)}`,
        );
      }
    }
    // The failure detail is not repeated here — the prompt template carries it
    // under "Failure detail:", redacted at the call site. Everything in this
    // excerpt is already redacted (and every slice is taken after redaction),
    // so nothing reaches the model unredacted.
    return parts.join("\n\n").trim() || "(no context captured)";
  }
}

/** Persisted cli/model overrides for the Debugger, sanitized to non-empty strings. */
function fromPersistedState(config: RepoOSConfig): { cli?: string; model?: string } {
  const state = config.builtInAgents?.debugger ?? {};
  const cli = typeof state.cli === "string" && state.cli.trim() ? state.cli.trim() : undefined;
  const model =
    typeof state.model === "string" && state.model.trim() ? state.model.trim() : undefined;
  return { cli, model };
}
