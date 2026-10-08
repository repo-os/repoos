/**
 * CTO board-conversation display helpers (#0732).
 *
 * The CTO panel draws one chronological conversation: human messages,
 * monitoring markers, streamed assistant output, and each run's report. The
 * server keeps a single saved "latest report" (`report.md`) as a fallback for
 * when the conversation history is missing — a reload before the session was
 * persisted, or legacy data written before the session buffer existed.
 *
 * These helpers fold that saved report into the conversation exactly once. When
 * the same report is already present as streamed text, nothing is added; when it
 * is not (or the history is empty), the report is appended as a normal assistant
 * text entry so the panel renders it with the same markdown and chat styling as
 * every other reply.
 */
import type { AgentOutputEntry } from "../types";

/**
 * Shortest text that still counts as "the same report" via a prefix match. The
 * saved report can differ from its streamed source by a length cap or an
 * appended quarantine note, but a tiny narration line must never swallow it.
 */
const MIN_PREFIX_MATCH = 40;

/** True when `markdown` already appears as assistant text in the transcript. */
export function reportAlreadyInConversation(
  lines: readonly AgentOutputEntry[],
  markdown: string,
): boolean {
  const target = markdown.trim();
  if (!target) return false;

  // Structured CLIs stream the report as a single `text` entry; non-JSON ones
  // print it as plain stdout, which arrives as a run of `out` lines. Both are
  // candidates for "the report is already here".
  const candidates: string[] = [];
  const outLines: string[] = [];
  for (const line of lines) {
    if ("type" in line) {
      if (line.type === "text") candidates.push(line.text.trim());
      continue;
    }
    if (line.s === "out") outLines.push(line.d);
  }
  if (outLines.length) candidates.push(outLines.join("\n").trim());

  for (const text of candidates) {
    if (!text) continue;
    if (text === target) return true;
    // The saved report may append a quarantine note, or be capped at a fixed
    // length; a substantial prefix on either side is the same report.
    if (text.length >= MIN_PREFIX_MATCH && target.startsWith(text)) return true;
    if (target.length >= MIN_PREFIX_MATCH && text.startsWith(target)) return true;
  }
  return false;
}

/** The saved latest report the server exposes, when one exists. */
export interface CtoSavedReport {
  markdown: string;
  at: string;
}

/**
 * The conversation entries to render: the transcript, plus the saved report as
 * an assistant entry when it is not already represented. The original array is
 * never mutated; a new array is returned only when a report must be added.
 */
export function withSavedReport(
  lines: readonly AgentOutputEntry[],
  report: CtoSavedReport | null | undefined,
): AgentOutputEntry[] {
  const base = [...lines];
  if (!report) return base;
  const markdown = report.markdown?.trim();
  if (!markdown) return base;
  if (reportAlreadyInConversation(base, markdown)) return base;
  // Appended rather than inserted: it is the newest report, and when the
  // history is empty it is the only entry. Any earlier report is already in the
  // transcript, so it keeps its chronological position.
  base.push({ type: "text", text: markdown, at: report.at });
  return base;
}
