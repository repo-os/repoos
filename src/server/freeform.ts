/**
 * Freeform task creation: turns a rough, conversational explanation into a
 * structured task file. The configured PM agent writes the file; the system
 * only assigns the id / timestamps and persists through the normal create
 * path. When the PM agent is missing or fails, the raw explanation survives as
 * a draft task so the user's capture is never lost.
 */
import type { Agent } from "../core/types.js";
import { FM_DELIM, parseDocument } from "../core/frontmatter.js";

/** Fields extracted from the agent's generated file, fed to createTask. */
export interface GeneratedTaskInput {
  title: string;
  type?: string;
  priority?: string;
  area?: string;
  assignedTo?: string;
  body: string;
}

const TASK_TYPES = ["feature", "bug", "chore", "spec", "refactor"] as const;
const PRIORITIES = ["p0", "p1", "p2", "p3"] as const;

/**
 * A short, human title for a raw explanation, for the no-agent fallback.
 * First non-empty, non-delimiter line of the explanation wins; otherwise the
 * first 60 chars. Delimiter lines (a line that is exactly `---`) are skipped so
 * a stray frontmatter delimiter can never become a title.
 */
export function explanationTitle(explanation: string): string {
  const line =
    explanation
      .split("\n")
      .map((l) => l.trim())
      .find((l) => Boolean(l) && l !== FM_DELIM) ?? "";
  if (line.length > 0) {
    return line.length <= 60 ? line : `${line.slice(0, 57).trimEnd()}…`;
  }
  const flat = explanation
    .replace(/\s+/g, " ")
    .replace(/\s*---\s*/g, " ")
    .trim();
  return flat.length <= 60 ? flat || "Untitled task" : `${flat.slice(0, 57).trimEnd()}…`;
}

function firstMatch<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback?: T,
): T | undefined {
  const v = typeof value === "string" ? value.toLowerCase().trim() : "";
  return allowed.find((a) => a === v) ?? fallback;
}

/**
 * The control-token names a leaked tool call is built from. Kept as bare names
 * so every dialect below is matched by one pattern.
 */
const TOOL_TOKEN_NAMES =
  "tool_calls?|tool\u2581calls?|function_calls|function_results|invoke|parameter";

/**
 * A line that is nothing but a tool-call control token. Models that render
 * tool calls as inline markup can emit these into plain prose when a turn is
 * cut short, in several dialects: bare (`<parameter>`), namespaced
 * (`<ns:invoke>`), and special-token wrapped, where the delimiter is either an
 * ASCII or a fullwidth vertical bar.
 *
 * Deliberately anchored to the whole line: a task body legitimately discusses
 * markup inline (`the <input> element`), and only a lone control token on its
 * own line is unambiguous leakage.
 */
const TOOL_TOKEN_LINE = new RegExp(
  `^<\\/?[\uff5c|]?\\s*(?:[\\w.-]+[:\u2581\uff5c|])?(?:${TOOL_TOKEN_NAMES})(?:[_\u2581](?:begin|end))?\\b[^>]*[\uff5c|]?\\s*\\/?>$`,
);

/** True for a fenced-code-block delimiter line (``` or ~~~). */
function isFence(line: string): boolean {
  return /^(?:```|~~~)/.test(line);
}

/**
 * Drop leaked tool-call markup from an agent's answer.
 *
 * Only whole lines are removed, and only outside fenced code blocks, so a task
 * that legitimately quotes markup in a code block keeps it. When a removal
 * strands a second consecutive blank line, one is dropped so cutting a block
 * out of the middle of a body doesn't leave a gap. A body with no leaked
 * tokens is returned unchanged.
 */
export function stripToolCallMarkup(output: string): string {
  const kept: string[] = [];
  let inFence = false;
  let removed = false;
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (isFence(trimmed)) inFence = !inFence;
    if (!inFence && TOOL_TOKEN_LINE.test(trimmed)) {
      removed = true;
      continue;
    }
    const previous = kept[kept.length - 1];
    if (removed && !inFence && trimmed === "" && previous !== undefined && previous.trim() === "") {
      continue;
    }
    kept.push(line);
  }
  return removed ? kept.join("\n").trim() : output;
}

/**
 * Parse the PM agent's generated markdown into createTask input. Never throws:
 * anything unparsable falls back to treating the whole output as the body with
 * a derived title, so input survives a bad agent response.
 *
 * The agent's answer is the task file verbatim, so any tool-call markup it
 * leaked would be persisted as body text — it is stripped before parsing so a
 * leaked token can never become the title either.
 */
export function parseGeneratedTask(rawOutput: string): GeneratedTaskInput {
  const output = stripToolCallMarkup(rawOutput);
  const { data, body, hadFrontmatter } = parseDocument(output.trim());
  const rawTitle =
    typeof data.title === "string" && data.title.trim()
      ? data.title.trim()
      : typeof data.title === "number"
        ? String(data.title)
        : "";

  if (hadFrontmatter) {
    // A frontmatter block was present (open, closed, or embedded-in-body).
    // Use its parsed fields; the title falls back to the body's first line so
    // a delimiter can never leak into the title.
    return {
      title: rawTitle || explanationTitle(body),
      type: firstMatch(data.type, TASK_TYPES),
      priority: firstMatch(data.priority, PRIORITIES),
      area: typeof data.area === "string" && data.area.trim() ? data.area.trim() : undefined,
      assignedTo:
        typeof data.assigned_to === "string" && data.assigned_to.trim()
          ? data.assigned_to.trim()
          : undefined,
      body: body.trim(),
    };
  }

  // No usable frontmatter: keep the raw output as the body.
  return { title: explanationTitle(output), body: output.trim() };
}

/** The task-file conventions the PM agent must follow, inlined into its prompt. */
const TASK_CONVENTIONS = [
  "Task files are markdown with YAML frontmatter, like:",
  "---",
  'id: "0001"        # assigned by the system — do NOT include',
  "title: Short imperative title",
  "type: feature     # feature | bug | chore | spec | refactor",
  "status: inbox     # assigned by the system — do NOT include",
  "priority: p2      # p0 | p1 | p2 | p3",
  "area: web         # the part of the product, e.g. web, core, cli, ui, api",
  "assigned_to: ai   # ai | human | unassigned",
  "branch: feat/slug # derived from the title — do NOT include",
  "created_at: ...   # assigned by the system — do NOT include",
  "updated_at: ...   # assigned by the system — do NOT include",
  "---",
  "",
  "The body follows with markdown sections, in order:",
  "- ## Problem — what's broken or missing, why it matters",
  "- ## Desired UX — what the end experience should be",
  "- ## Acceptance criteria — a concrete checkbox list (- [ ] ...)",
  "- ## Notes for AI — constraints, files to touch, things NOT to do",
  "- ## Scope (optional) — what this task covers and what is deferred",
  "- ## Related (optional) — related task ids or docs",
  "- ## Activity — leave it out; the system appends entries",
  "",
  "Flesh out each section with concrete detail drawn ONLY from the explanation.",
  "Do not invent requirements the user did not imply. When a detail is genuinely",
  "ambiguous, pick a reasonable default and state the assumption in Notes for AI.",
  "Do not ask clarifying questions.",
].join("\n");

/**
 * Build the PM agent's prompt from a raw explanation.
 *
 * The system already persists the raw explanation under a `## Original prompt`
 * section before the PM runs, so the PM is told not to duplicate it. It should
 * still end with the structured body only; the system re-ensures the section.
 */
export function pmPrompt(explanation: string): string {
  return [
    "You are the PM agent for RepoOS. Turn the user's rough explanation into a",
    "complete, well-formed task file that drops straight into the repo's work/ dir.",
    "",
    "The user's explanation:",
    "",
    "```",
    explanation.trim(),
    "```",
    "",
    "The raw explanation is already stored by the system under a",
    "'## Original prompt' section, so do NOT repeat it in your output — write",
    "the structured body only (the section is re-appended for you).",
    "",
    "Task-file conventions (follow them exactly):",
    "",
    TASK_CONVENTIONS,
    "",
    "Respond with ONLY the markdown file content, starting with the opening '---'",
    "line and with no preamble, commentary, or code fences.",
  ].join("\n");
}

/** The persisted setting key that controls the drawer's default mode. */
export const DEFAULT_TASK_MODE_KEY = "defaultTaskMode";
