/**
 * The "Story context" block for managed engineer/reviewer prompts (#0691).
 *
 * A task's `story` tag and its definition file under `stories/` carry the
 * shared background for a delivery slice (why the work exists, decisions made,
 * sibling tasks) — but until this module, that background never reached the
 * agent doing the work unless the task body repeated it. This renders a small,
 * bounded block for the prompt builder, and a one-line summary the runner
 * records so the reviewer can see what the agent actually saw.
 *
 * Node-only I/O (reads the story file and the task tree). Kept out of
 * `stories.ts`/`story-display.ts`, which are browser-safe and shared with the
 * UI bundle.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { emptyGitInfo } from "./git.js";
import { parseDocument } from "./frontmatter.js";
import { findStoryDefinitionByKey } from "./story-definition-files.js";
import { normalizeStoryName, storyKey } from "./stories.js";
import { parseTask } from "./task.js";
import type { RepoOSConfig, Task } from "./types.js";

/**
 * Default excerpt size for the prompt block: a few KB, enough for a story's
 * "what happened / decisions / how to use this" preamble without shipping a
 * whole field report into every engineer and reviewer turn. The path to the
 * file is always included so the agent can read the rest.
 */
export const DEFAULT_STORY_EXCERPT_BYTES = 4096;

/** Floor/ceiling on the configurable excerpt so a bad value can't break a prompt. */
const MIN_STORY_EXCERPT_BYTES = 512;
const MAX_STORY_EXCERPT_BYTES = 64 * 1024;

/** One sibling task line in the block: only the fields the block renders. */
interface SiblingTask {
  id: string;
  title: string;
  status: string;
}

/** Resolve and clamp the configured excerpt size, falling back to the default. */
export function storyExcerptBytes(config: Pick<RepoOSConfig, "stories">): number {
  const raw = config.stories?.excerptBytes;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_STORY_EXCERPT_BYTES;
  const whole = Math.floor(raw);
  if (whole < MIN_STORY_EXCERPT_BYTES) return MIN_STORY_EXCERPT_BYTES;
  if (whole > MAX_STORY_EXCERPT_BYTES) return MAX_STORY_EXCERPT_BYTES;
  return whole;
}

/**
 * The characters of a definition body that fit the byte cap, cut on a line
 * boundary so the excerpt never ends mid-word (or mid-code-fence) more than
 * necessary. Returns the whole body when it already fits.
 */
export function excerptStoryBody(body: string, maxBytes: number): string {
  if (Buffer.byteLength(body, "utf8") <= maxBytes) return body;
  // Take an over-long slice by characters, then trim back to the cap. A
  // multi-byte character can straddle the boundary; slicing by code unit and
  // re-checking keeps the result valid UTF-8 and never above the cap.
  let slice = body.slice(0, maxBytes);
  while (Buffer.byteLength(slice, "utf8") > maxBytes) slice = slice.slice(0, -1);
  const lastBreak = slice.lastIndexOf("\n");
  if (lastBreak > 0) slice = slice.slice(0, lastBreak);
  return `${slice.trimEnd()}\n\n[Story definition truncated at ${maxBytes} bytes — read the file for the rest.]`;
}

/** Recursively collect task markdown files under the configured work dir. */
function walkTaskFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) walkTaskFiles(full, exts, acc);
    else if (exts.includes(extname(entry))) acc.push(full);
  }
  return acc;
}

/**
 * Every other task tagged with the same story, sorted by id. Reads the task
 * tree directly and parses without git enrichment — the block only needs id,
 * title, status and the story tag, and building a full index would spawn git
 * for facts this never uses. A file that fails to parse is skipped, never
 * thrown: a single bad task must not stop an agent run.
 */
function siblingTasks(config: RepoOSConfig, story: string, excludeId: string): SiblingTask[] {
  const root = join(config.root, config.workDir);
  const key = storyKey(story);
  const siblings: SiblingTask[] = [];
  for (const absPath of walkTaskFiles(root, config.taskExtensions)) {
    let content: string;
    try {
      content = readFileSync(absPath, "utf8");
    } catch {
      continue;
    }
    // Skip files with no explicit `id` — the same rule the indexer applies, so
    // a hand-written note never appears as a sibling.
    if (!("id" in parseDocument(content).data)) continue;
    let task: Task;
    try {
      task = parseTask({
        content,
        absPath,
        root: config.root,
        defaultStatus: config.defaultStatus,
        defaultAssignee: config.defaultAssignee,
        git: emptyGitInfo(),
      });
    } catch {
      continue;
    }
    if (task.id === excludeId) continue;
    if (storyKey(normalizeStoryName(task.story)) !== key) continue;
    siblings.push({ id: task.id, title: task.title, status: task.status });
  }
  return siblings.sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Render the "Story context" block for a task, or null when there is nothing
 * to add: no `story` tag, or a tag whose name resolves to no definition file.
 * The task's own story is looked up by key so the tag and the file's `name`
 * match case-insensitively, exactly as the board groups them.
 */
export function buildStoryContext(task: Task, config: RepoOSConfig): string | null {
  const story = normalizeStoryName(task.story);
  if (!story) return null;

  let definition = null;
  try {
    definition = findStoryDefinitionByKey(config, storyKey(story));
  } catch {
    return null;
  }
  if (!definition) return null;

  const maxBytes = storyExcerptBytes(config);
  const excerpt = excerptStoryBody(definition.body, maxBytes);
  const label = definition.number ? `#${definition.number} — ${definition.name}` : definition.name;
  const siblings = siblingTasks(config, story, task.id);

  const lines: string[] = [
    "## Story context",
    "",
    `This task is part of the story ${label} (\`${definition.path}\`).`,
    "The story file holds the shared background for this slice — read it if the excerpt below is cut off or you need the full reasoning.",
    "",
    "### Sibling tasks in this story",
    "",
  ];
  if (siblings.length) {
    for (const s of siblings) lines.push(`- #${s.id} ${s.title} (${s.status})`);
  } else {
    lines.push("- (none yet)");
  }
  lines.push("", `### Story definition (first ${maxBytes} bytes)`, "", excerpt);
  return lines.join("\n");
}

/**
 * The one-line summary the runner records as a sys activity entry so the task
 * drawer shows that a story context was included, which story, and how big the
 * excerpt was (#0691). Null when no block would be added, so no noise on
 * ordinary untagged tasks. Resolves only the definition — it never walks the
 * task tree, so recording this costs nothing beyond the story-file read.
 */
export function storyContextSummary(task: Task, config: RepoOSConfig): string | null {
  const story = normalizeStoryName(task.story);
  if (!story) return null;
  let definition = null;
  try {
    definition = findStoryDefinitionByKey(config, storyKey(story));
  } catch {
    return null;
  }
  if (!definition) return null;
  const maxBytes = storyExcerptBytes(config);
  return `Story context: "${definition.name}" included in the prompt (definition excerpt up to ${maxBytes} bytes)`;
}
