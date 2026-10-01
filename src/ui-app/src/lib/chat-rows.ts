/**
 * Chat row grouping (#0506).
 *
 * A single agent turn emits far more tool calls than messages, so rendering one
 * row per tool call buried the actual conversation under `bash` / `read` /
 * `edit` chrome. This module is the one place that turns a flat, normalized
 * `AgentOutputEntry[]` transcript into the rows a chat actually draws:
 *
 *  - a maximal run of adjacent `tool` entries collapses into **one** row with
 *    per-outcome counts and the *latest* timestamp in the run;
 *  - adjacent assistant text parts merge into one message block, so a
 *    multi-part reply reads as one message rather than several;
 *  - `step` markers are dropped entirely — a step boundary renders no row of
 *    its own, because the tool-call row it used to punctuate now carries the
 *    same information (and a real timestamp) itself;
 *  - whitespace-only text entries (incl. zero-width) are dropped, so a row
 *    always has content;
 *
 * This is a **view-layer** transform. It never touches what is stored, streamed
 * over SSE as `agent.output`, or exported: the debugger endpoints, report
 * extraction and skill suggestions all still see the original individual
 * entries, in order. Step entries stay in the data model for exactly those
 * consumers — they are dropped here, at the display boundary, and nowhere else.
 *
 * Grouping happens *after* normalization, so it is a rendering concern and
 * behaves identically for every driver (opencode, Claude Code, Codex, GitHub
 * Copilot, Cursor, Kiro, Qwen, Antigravity) — nothing here branches on which
 * agent produced the entries.
 */

import { clampPlainDisplayText, isDisplayEmptyText, isThematicBreakOnlyText } from "./markdown.js";
import type { AgentOutputEntry } from "../types";

/** Strip ANSI escape sequences so no `[0m`-style codes ever reach the DOM. */
const ANSI_RE =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

/** Remove ANSI escapes from CLI output before it is rendered. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * The normalized states that mean "this call failed".
 *
 * The drivers do not agree on the spelling: opencode, Claude Code, Copilot,
 * Cursor, Qwen and Antigravity all normalize to `"error"`, but Codex passes
 * `item.status` through verbatim and its JSONL says `"failed"`. Matching only
 * `"error"` would therefore paint a failed codex command green — the exact
 * "no outcome signal" problem this row exists to solve. An exact set, not a
 * substring test, so an unrelated future state is never silently miscounted.
 */
const FAILED_STATES: ReadonlySet<string> = new Set(["error", "failed"]);

/** Did this tool call fail, per its normalized `state`? */
export function isFailedState(state: string | undefined): boolean {
  return state !== undefined && FAILED_STATES.has(state);
}

/** One tool call inside a grouped tool-call row. */
export interface ToolCallRow {
  /** The tool's name, e.g. "bash", "read", "edit". */
  tool: string;
  /** Raw driver state, e.g. "completed" | "error" | "failed". Absent when unknown. */
  state?: string;
  /** Rendered input (a bash command, pretty-printed JSON, …). */
  input?: string;
  /** Rendered output, or the error message when the call failed. */
  output?: string;
  /** ISO timestamp of the entry this call came from, when known. */
  at?: string;
  /**
   * True when the call itself failed. Keys off the normalized `state` only
   * (see `FAILED_STATES`) — a result that merely *contains* an error string is
   * still a success.
   */
  error: boolean;
}

/** A non-tool row: a message, a human turn, or a system / plain line. */
export interface MessageRow {
  /**
   * Position in the row list. Stable for an append-only stream, so it is safe
   * as a `:key` — a growing run keeps its identity and its expand state.
   */
  key: number;
  kind: "line" | "text" | "human" | "sys";
  /**
   * Newest `at` among the entries this row represents — the row's
   * last-updated time. Absent when no entry carried a timestamp.
   */
  at?: string;
  /** The entries merged into this row (always 1 unless text parts merged). */
  entries: AgentOutputEntry[];
  /** The row's text, ANSI-stripped. */
  text: string;
  /** Legacy `{s, d}` stream tag, for telling `out` from `err`. */
  s?: "out" | "err" | "sys";
}

/** A maximal run of adjacent tool calls, rendered as one expandable row. */
export interface ToolGroupRow {
  key: number;
  kind: "tools";
  /** Newest `at` across the grouped calls — when the batch actually finished. */
  at?: string;
  /** The calls, in their original order. */
  calls: ToolCallRow[];
  /** How many calls the row groups. */
  total: number;
  /** Calls that completed. */
  ok: number;
  /** Calls that failed. */
  failed: number;
}

/** One rendered row of an agent conversation. */
export type DisplayRow = MessageRow | ToolGroupRow;

/**
 * Newest parseable `at` in a set of entries, or undefined when none carries
 * one. Legacy persisted transcripts predate timestamps, so "unknown" has to be
 * a real outcome the UI can hide — never a fabricated value.
 */
export function latestAt(entries: readonly { at?: string }[]): string | undefined {
  let best: string | undefined;
  let bestMs = -Infinity;
  for (const entry of entries) {
    if (!entry.at) continue;
    const ms = new Date(entry.at).getTime();
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    bestMs = ms;
    best = entry.at;
  }
  return best;
}

/** A tool entry, narrowed out of the transcript union. */
type ToolEntry = Extract<AgentOutputEntry, { type: "tool" }>;

/** The text a non-tool row displays, ANSI-stripped. */
function rowText(entry: AgentOutputEntry): string {
  if ("type" in entry) {
    if (entry.type === "text" || entry.type === "human") return stripAnsi(entry.text);
    return entry.type === "sys" ? stripAnsi(entry.d) : "";
  }
  return stripAnsi(entry.d);
}

/** Plain (non-markdown) bubbles: clamp runs and trailing whitespace for display. */
function displayPlainText(text: string): string {
  return clampPlainDisplayText(text);
}

/** Join consecutive assistant text parts without amplifying surrounding newlines. */
/** Drop a row that is only thematic-break noise from the assistant stream (#0563). */
function shouldDropThematicSeparatorRow(entry: AgentOutputEntry, rawText: string): boolean {
  if (!isThematicBreakOnlyText(rawText)) return false;
  if ("type" in entry) {
    if (entry.type === "human") return false;
    return entry.type === "text" || entry.type === "sys";
  }
  return entry.s === "out" || entry.s === "sys";
}

function mergeAssistantText(existing: string, addition: string): string {
  const left = existing.replace(/\s+$/u, "");
  const right = addition.replace(/^\s+/u, "");
  if (!right) return left;
  if (!left) return right;
  return `${left}\n\n${right}`;
}

function toolCall(entry: ToolEntry): ToolCallRow {
  return {
    tool: entry.tool,
    state: entry.state,
    input: entry.input ? stripAnsi(entry.input) : undefined,
    output: entry.output ? stripAnsi(entry.output) : undefined,
    at: entry.at,
    error: isFailedState(entry.state),
  };
}

/** An in-progress tool run, held until a non-tool entry (or the end) closes it. */
interface OpenRun {
  calls: ToolCallRow[];
  entries: ToolEntry[];
}

/**
 * Turn a flat transcript into the rows a chat renders. See the module docblock
 * for the rules; the short version is that this is the only place any chat
 * decides what a "row" is.
 */
export function toDisplayRows(entries: readonly AgentOutputEntry[]): DisplayRow[] {
  const rows: DisplayRow[] = [];
  let run: OpenRun | null = null;

  /** Close the open tool run into a row. A run is never empty by construction. */
  const flushRun = (): void => {
    if (!run) return;
    rows.push({
      key: rows.length,
      kind: "tools",
      at: latestAt(run.entries),
      calls: run.calls,
      total: run.calls.length,
      ok: run.calls.filter((call) => !call.error).length,
      failed: run.calls.filter((call) => call.error).length,
    });
    run = null;
  };

  for (const entry of entries) {
    // A step boundary draws no row. It is dropped (rather than rendered as an
    // empty or "continue" row) precisely so it cannot split a tool run either:
    // the end of a batch of tool calls is already marked by that row's own
    // timestamp. The entry itself stays in the transcript for the consumers
    // that do read steps.
    if ("type" in entry && entry.type === "step") continue;

    if ("type" in entry && entry.type === "tool") {
      run ??= { calls: [], entries: [] };
      run.calls.push(toolCall(entry));
      run.entries.push(entry);
      continue;
    }

    flushRun();

    const rawText = rowText(entry);
    const isAssistantText = "type" in entry && entry.type === "text";
    // Nothing to show — no row, rather than an empty bubble (incl. whitespace-only).
    if (isDisplayEmptyText(rawText)) continue;
    // Assistant stream only — humans may send a literal `---` on purpose.
    if (shouldDropThematicSeparatorRow(entry, rawText)) continue;
    const text = isAssistantText ? rawText.replace(/\s+$/u, "") : displayPlainText(rawText);

    const last = rows[rows.length - 1];
    // stderr arrives one line at a time. Keep a diagnostic together, but split
    // timestamped log records so distinct failures do not become one giant card.
    if (
      !("type" in entry) &&
      entry.s === "err" &&
      last?.kind === "line" &&
      last.s === "err" &&
      !/^\d{4}-\d{2}-\d{2}T\S+\s+(?:ERROR|WARN|INFO|DEBUG)\b/.test(text)
    ) {
      last.text += "\n" + rawText;
      last.entries.push(entry);
      last.at = latestAt(last.entries) ?? last.at;
      continue;
    }
    // Consecutive assistant text parts are one message. opencode streams a
    // reply part by part; without this they render as several stacked bubbles.
    if (last && last.kind === "text" && isAssistantText) {
      last.text = mergeAssistantText(last.text, text);
      last.entries.push(entry);
      last.at = latestAt(last.entries) ?? last.at;
      continue;
    }

    rows.push({
      key: rows.length,
      kind: "type" in entry ? entry.type : "line",
      at: entry.at,
      entries: [entry],
      text,
      s: "type" in entry ? undefined : entry.s,
    });
  }

  flushRun();
  return rows;
}

/** How a chat bubble should present a row: who is speaking. */
export type BubbleRole = "human" | "assistant" | "status";

/**
 * Map a row onto the speaker role a bubble chat renders it as, or `null` when
 * the row is not a bubble at all (a tool-call run, which gets the shared
 * tool-call row instead of a speech bubble).
 */
export function bubbleRole(row: DisplayRow): BubbleRole | null {
  switch (row.kind) {
    case "human":
      return "human";
    case "text":
      return "assistant";
    case "line":
      return row.s === "out" ? "assistant" : "status";
    case "sys":
      return "status";
    case "tools":
      return null;
  }
}

/** "1 tool call" / "6 tool calls" — the total badge on a grouped row. */
export function toolCallCountLabel(total: number): string {
  return total === 1 ? "1 tool call" : `${total} tool calls`;
}
