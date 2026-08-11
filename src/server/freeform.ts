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
  const flat = explanation.replace(/\s+/g, " ").replace(/\s*---\s*/g, " ").trim();
  return flat.length <= 60 ? flat || "Untitled task" : `${flat.slice(0, 57).trimEnd()}…`;
}

function firstMatch<T extends string>(value: unknown, allowed: readonly T[], fallback?: T): T | undefined {
  const v = typeof value === "string" ? value.toLowerCase().trim() : "";
  return allowed.find((a) => a === v) ?? fallback;
}

/**
 * Parse the PM agent's generated markdown into createTask input. Never throws:
 * anything unparsable falls back to treating the whole output as the body with
 * a derived title, so input survives a bad agent response.
 */
export function parseGeneratedTask(output: string): GeneratedTaskInput {
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

/** Build the PM agent's prompt from a raw explanation. */
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
