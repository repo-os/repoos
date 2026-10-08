/**
 * Flag help metadata for `repoos new` / `repoos update` (#0699).
 *
 * The parse tables live in `src/commands/tasks.ts` (`NEW_FLAGS`, derived from
 * `NEW_FLAG_HELP`, and `UPDATE_FLAGS`). These ordered maps are the single
 * source of truth for help text: `renderHelp` (the top-level Tasks group) and
 * `printCommandHelp` both render from them, so a flag can no longer be accepted
 * without a one-line description. A test asserts every key of `UPDATE_FLAGS`
 * has an entry here, which makes "added a flag, forgot the help" fail the gate.
 *
 * `UPDATE_FLAG_HELP` intentionally covers the flags `cmdUpdate` handles
 * specially (`shots`, `section`, `section-body`, `clear-questions`, `force`),
 * not just the `UPDATE_FLAGS` parse map.
 */
import { PRIORITIES, TASK_TYPES } from "../core/types.js";

/**
 * The full valid value sets for `--priority` / `--type`, rendered into the
 * usage/help text so accepted values are obvious at the point of use (#0656).
 */
export const PRIORITY_USAGE = PRIORITIES.join("|");
export const TYPE_USAGE = TASK_TYPES.join("|");

/** One flag's help metadata. */
export interface TaskFlagHelp {
  /** Placeholder rendered after the flag (e.g. `true|false`); omit for a boolean flag. */
  value?: string;
  /** One-line description, shown by `repoos <cmd> --help`. */
  desc: string;
}

/** Every flag `repoos new` accepts, in help order. */
export const NEW_FLAG_HELP: Record<string, TaskFlagHelp> = {
  ai: { desc: "Assign the task to an AI engineer" },
  type: { value: TYPE_USAGE, desc: "Task type" },
  area: { value: "web,core", desc: "Area(s), comma-separated" },
  story: { value: '"name"', desc: "Attach the task to (or create) a story" },
  "depends-on": { value: "ids", desc: "Comma-separated task ids that must land first" },
  priority: { value: PRIORITY_USAGE, desc: "Priority" },
  "needs-input": { value: "true|false", desc: "Flag the task as needing human input" },
  questions: { value: '"Q1\\nQ2"', desc: "Open questions for the human (newline or JSON list)" },
  hold: { value: "true|false", desc: "Hold the task out of auto-dispatch" },
  paths: { value: "a,b", desc: "Files the task touches, e.g. src/a.ts,src/b.ts" },
  body: { value: '"..."|-', desc: "Task body; `-` reads it from stdin" },
  shots: { value: '"<JSON list>"|-', desc: "Declare the ## Shots section (validated JSON)" },
};

/** Every flag `repoos update` accepts, in help order. */
export const UPDATE_FLAG_HELP: Record<string, TaskFlagHelp> = {
  title: { value: '"..."', desc: "Task title" },
  area: { value: "web,core", desc: "Area(s), comma-separated" },
  story: { value: '"name"', desc: "Attach the task to (or create) a story" },
  "depends-on": { value: "ids", desc: "Comma-separated task ids that must land first" },
  priority: { value: PRIORITY_USAGE, desc: "Priority" },
  type: { value: TYPE_USAGE, desc: "Task type" },
  body: { value: '"..."|-', desc: "Replace the body; `-` reads it from stdin" },
  branch: { value: "b", desc: "Branch name" },
  "assigned-to": { value: "ai|human", desc: "Assignee" },
  "needs-input": { value: "true|false", desc: "Flag the task as needing human input" },
  "needs-merge": { value: "true|false", desc: "Flag the task as needing a merge" },
  hold: { value: "true|false", desc: "Hold the task out of auto-dispatch" },
  paths: { value: "a,b", desc: "Files the task touches, e.g. src/a.ts,src/b.ts" },
  questions: { value: '"Q1\\nQ2"', desc: "Open questions for the human (newline or JSON list)" },
  "clear-questions": { desc: "Clear the recorded questions" },
  shots: { value: '"<JSON list>"|-', desc: "Declare the ## Shots section (validated JSON)" },
  section: { value: '"heading"', desc: "Replace/create one ## section (pair with --section-body)" },
  "section-body": { value: '"..."|-', desc: "Body for --section; `-` reads it from stdin" },
  force: { desc: "Allow a --body replace that drops spec headings" },
  agent: { value: "name", desc: "Engineer agent override (empty clears)" },
  cli: { value: "name", desc: "Engineer CLI override (empty clears)" },
  model: { value: "name", desc: "Engineer model override (empty clears)" },
  "pm-agent": { value: "name", desc: "PM agent override (empty clears)" },
  "pm-cli": { value: "name", desc: "PM CLI override (empty clears)" },
  "pm-model": { value: "name", desc: "PM model override (empty clears)" },
  "review-agent": { value: "name", desc: "Reviewer agent override (empty clears)" },
  "review-cli": { value: "name", desc: "Reviewer CLI override (empty clears)" },
  "review-model": { value: "name", desc: "Reviewer model override (empty clears)" },
};

/** One `--flag` / `--flag value` token, as used in a usage line. */
export function flagToken(name: string, help: TaskFlagHelp): string {
  return help.value ? `--${name} ${help.value}` : `--${name}`;
}

/** Ordered `--flag [value]` tokens for every entry in a help map. */
export function flagUsageTokens(help: Record<string, TaskFlagHelp>): string[] {
  return Object.entries(help).map(([name, h]) => flagToken(name, h));
}

/** The dim `flags:` summary line: `--flag value · --other`, in declaration order. */
export function flagSummary(help: Record<string, TaskFlagHelp>): string {
  return flagUsageTokens(help).join(" · ");
}
