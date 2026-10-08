/**
 * Git-tracked story definition files (under `storiesDir`, default `stories/`,
 * #0486). Node-only I/O.
 *
 * Definitions carry a stable zero-padded `number` (#0515) — the story's
 * counterpart to a task's `id` and an input's `number` — so the board can show
 * `#0007` in the same upper-left chip position those two use and deep-link to
 * the story with a number that survives a rename. Like `ensureInputNumbers`,
 * existing unique numbers stay stable; duplicate numbers are resolved by
 * keeping the oldest claimant and assigning new numbers to the others.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { FM_DELIM, parseDocument, serializeDocument } from "./frontmatter.js";
import { normalizeStoryName, storyKey } from "./stories.js";
import type { StoryDefinition } from "./story-display.js";

/**
 * The stories directory (#0637): `repoos.toml`'s `storiesDir` when set, else
 * `"stories"`. Every former `STORIES_DIR` constant read goes through the
 * config so a relocated directory is consistent everywhere — including the
 * close-out drift check, which exempts this directory from "main moved"
 * resyncs (commits like `docs(stories): add …` are the server's own
 * bookkeeping and can never compete with a task being closed out).
 */
export function storiesDirOf(config: Pick<RepoOSConfig, "storiesDir">): string {
  return config.storiesDir || "stories";
}

/** Frontmatter key order for a story file — `repoos` normalizes on write. */
const STORY_KEY_ORDER = ["name", "number", "created_at", "created_by"] as const;

/**
 * Normalize a raw frontmatter `number` to the canonical zero-padded form.
 * Returns `""` for anything that isn't a plain integer (missing, empty, or
 * garbage), which callers treat as "needs a number" — the same contract as
 * `normalizeNumber` in `input.ts`.
 */
function normalizeStoryNumber(v: unknown): string {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v)).padStart(4, "0");
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return v.trim().padStart(4, "0");
  return "";
}

/**
 * Set a frontmatter key in a story file's raw content, adding it to the block
 * if it isn't there yet.
 *
 * Scoped to the leading `---` block on purpose. A naive `^key:` with the `m`
 * flag matches anywhere in the file, so a story whose *body* happens to open a
 * line with `number:` would have that prose rewritten instead of gaining the
 * field. The delimiters are matched with `\r?\n` so CRLF frontmatter is
 * handled too — otherwise the insert silently no-ops while the caller still
 * believes the write succeeded.
 *
 * Returns the content unchanged when there is no parseable frontmatter, so the
 * caller can detect the no-op and leave the file for the next run.
 */
function setStoryField(content: string, key: string, value: string): string {
  const open = /^---[ \t]*(\r?\n)/.exec(content);
  if (!open) return content;
  const eol = open[1]!;
  const start = open[0].length;
  // The first `\n---` after the opening delimiter closes the block.
  const close = content.indexOf("\n---", start);
  if (close === -1) return content;
  const block = content.slice(start, close);
  const line = `${key}: "${value}"`;
  const re = new RegExp(`^${key}:.*$`, "m");
  // Join with whatever the block already uses, so backfilling a CRLF file
  // doesn't leave it with one LF line among CRLF ones.
  const next = re.test(block)
    ? block.replace(re, line)
    : `${line}${eol}${block.replaceAll(/\r?\n/g, eol)}`;
  return content.slice(0, start) + next + content.slice(close);
}

export function fallbackStoryName(text: string): string {
  const line =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => Boolean(l) && l !== FM_DELIM) ?? "";
  if (line.length > 0) {
    return line.length <= 60 ? line : `${line.slice(0, 57).trimEnd()}…`;
  }
  const flat = text
    .replace(/\s+/g, " ")
    .replace(/\s*---\s*/g, " ")
    .trim();
  return flat.length <= 60 ? flat || "Untitled story" : `${flat.slice(0, 57).trimEnd()}…`;
}

function storiesRoot(config: RepoOSConfig): string {
  return join(config.root, storiesDirOf(config));
}

function isStoryFile(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith(".");
}

/**
 * Two independent kinds of PM activity show as the same "PM is working"
 * indicator on a story, so they get two registries rather than one shared bit:
 *
 *   - The freeform flesh-out (`fleshOutStory`) — a fire-and-forget closure that
 *     never enters the AgentRunner, tracked here by definition path. It sets and
 *     clears its own flag on every exit path.
 *   - The story PM chat (#0515) — an AgentRunner session keyed
 *     `pm-story-v1:<number>`. Tracked by *session key* → path, so two users
 *     chatting about one story each hold their own entry and one exiting never
 *     drops the other's indicator.
 *
 * In-memory on purpose in both cases (like `reviews.isRunning`): a server
 * restart kills the runs along with the registry, so a stale "working" flag
 * cannot outlive the process. Story-file frontmatter would be the wrong home.
 */
const pmFleshOutWorking = new Set<string>();
const pmChatWorking = new Map<string, string>();

/** Mark/unmark a story's background flesh-out. */
export function setStoryPmWorking(path: string, on: boolean): void {
  if (on) pmFleshOutWorking.add(path);
  else pmFleshOutWorking.delete(path);
}

/**
 * Mark a PM chat session as live for a story. Keyed by session key rather than
 * path so concurrent chats about one story don't overwrite each other.
 */
export function markStoryPmChat(sessionKey: string, path: string): void {
  pmChatWorking.set(sessionKey, path);
}

/**
 * Clear one PM chat session and return the story it was about, or null for any
 * other runner session (engineer, task PM chat, board chat). The runner's
 * `agent.exited` hook calls this on every exit path, so the indicator can never
 * get stuck and the map never grows without bound.
 */
export function clearStoryPmChat(sessionKey: string): string | null {
  const path = pmChatWorking.get(sessionKey);
  pmChatWorking.delete(sessionKey);
  return path ?? null;
}

/** True while the PM is doing anything at all to this story. */
export function isStoryPmWorking(path: string): boolean {
  if (pmFleshOutWorking.has(path)) return true;
  for (const chatPath of pmChatWorking.values()) {
    if (chatPath === path) return true;
  }
  return false;
}

export function storySlug(name: string): string {
  return (
    normalizeStoryName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "story"
  );
}

export function collisionFreeStoryPath(
  config: RepoOSConfig,
  name: string,
  /** A path the caller is replacing, so it never counts as a collision. */
  ownPath?: string,
): string {
  const base = storySlug(name);
  const dir = storiesDirOf(config);
  let path = `${dir}/${base}.md`;
  let n = 2;
  while (path !== ownPath && existsSync(join(config.root, path))) {
    path = `${dir}/${base}-${n}.md`;
    n += 1;
  }
  return path;
}

export function parseStoryDefinitionFile(content: string, path: string): StoryDefinition | null {
  const { data, body, hadFrontmatter } = parseDocument(content);
  if (!hadFrontmatter) return null;
  const name = normalizeStoryName(data.name);
  if (!name) return null;
  const createdAt =
    typeof data.created_at === "string" && data.created_at.trim() ? data.created_at.trim() : "";
  const createdBy =
    typeof data.created_by === "string" && data.created_by.trim() ? data.created_by.trim() : "";
  return {
    key: storyKey(name),
    name,
    number: normalizeStoryNumber(data.number),
    path,
    body: body.trim(),
    createdAt,
    createdBy,
  };
}

export function listStoryDefinitions(config: RepoOSConfig): StoryDefinition[] {
  const dir = storiesRoot(config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(isStoryFile)
    .map((file) => {
      const path = `${storiesDirOf(config)}/${file}`;
      try {
        return parseStoryDefinitionFile(readFileSync(join(dir, file), "utf8"), path);
      } catch {
        return null;
      }
    })
    .filter((d): d is StoryDefinition => d !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findStoryDefinitionByKey(
  config: RepoOSConfig,
  key: string,
): StoryDefinition | null {
  const k = key.toLowerCase();
  return listStoryDefinitions(config).find((d) => d.key === k) ?? null;
}

/**
 * Next free 4-digit story number: highest existing number + 1, else `"0001"`.
 *
 * Read-then-write with no lock, so two creates racing on the same repo can land
 * on one number. That is the accepted trade here and matches `nextInputNumber`
 * exactly — story creation is a human clicking **New story**, not a fan-out, and
 * the boot migration that backfills is effectively sequential. Making it
 * airtight would need a persisted high-water mark, which would then disagree
 * with the input numbering this deliberately mirrors.
 */
function nextStoryNumber(config: RepoOSConfig): string {
  let max = 0;
  for (const d of listStoryDefinitions(config)) {
    const n = parseInt(d.number, 10);
    if (!Number.isNaN(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, "0");
}

/**
 * Retroactively assign a stable number to every story definition that lacks
 * one, in place. The direct counterpart of `ensureInputNumbers` for `stories/`
 * (#0515), with the same guarantees and the same limits:
 *
 *   - Idempotent. A number already on disk is never touched or renumbered, so a
 *     repeated call is a no-op — except when two files share the same `number:`,
 *     in which case the oldest claimant keeps it and the rest are reassigned.
 *   - Deterministic. Existing definitions are numbered oldest-first (by
 *     `created_at`, then path), skipping any number already in use.
 *   - Aside from duplicate resolution, a story that already holds a unique
 *     number keeps it across restarts. Deleting the highest-numbered story does
 *     free that number for the next one, exactly as it does for inputs — the
 *     guarantee is stability for the stories that remain, not a permanent
 *     ledger. Making it monotonic would need a high-water mark persisted outside
 *     the story files, which is a different design from the input numbering this
 *     deliberately mirrors.
 *
 * A file whose frontmatter can't be patched is left alone and NOT reported as
 * changed, so it stays eligible for the next run instead of being silently
 * skipped forever. See AGENTS.md — this touches the repo's own `stories/*.md`.
 */
export function ensureStoryNumbers(config: RepoOSConfig): StoryDefinition[] {
  const items = listStoryDefinitions(config);
  const byAge = [...items].sort(
    (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.path.localeCompare(b.path),
  );
  const used = new Set<string>();
  const needsNumber: StoryDefinition[] = [];
  for (const item of byAge) {
    const n = item.number;
    if (!n) needsNumber.push(item);
    else if (used.has(n)) needsNumber.push(item);
    else used.add(n);
  }
  if (!needsNumber.length) return [];
  needsNumber.sort(
    (a, b) => (a.createdAt || "").localeCompare(b.createdAt || "") || a.path.localeCompare(b.path),
  );
  let max = 0;
  for (const n of used) max = Math.max(max, parseInt(n, 10));
  const changed: StoryDefinition[] = [];
  for (const item of needsNumber) {
    let number = String(max + 1).padStart(4, "0");
    while (used.has(number)) number = String(++max).padStart(4, "0");
    used.add(number);
    max = parseInt(number, 10);
    const file = join(config.root, item.path);
    const before = readFileSync(file, "utf8");
    const after = setStoryField(before, "number", number);
    if (after === before) continue;
    writeFileSync(file, after, "utf8");
    changed.push({ ...item, number });
  }
  return changed;
}

export interface WriteStoryDefinitionInput {
  name: string;
  body: string;
  createdBy?: string;
  path?: string;
}

export function writeStoryDefinition(
  config: RepoOSConfig,
  input: WriteStoryDefinitionInput,
): StoryDefinition {
  const name = normalizeStoryName(input.name);
  if (!name) throw new Error("story name is required");
  const body = input.body.trim();
  if (!body) throw new Error("story description is required");
  const existing = findStoryDefinitionByKey(config, storyKey(name));
  if (existing) {
    throw new Error(`A story named "${existing.name}" already exists`);
  }
  const path = input.path ?? collisionFreeStoryPath(config, name);
  if (!path.startsWith(`${storiesDirOf(config)}/`) || !path.endsWith(".md")) {
    throw new Error("invalid story definition path");
  }
  const createdAt = new Date().toISOString();
  const createdBy = input.createdBy?.trim() || "api";
  // Every story gets its number on the way in, the same way a task gets its
  // id and an input its number — so the board can render `#0001` from the
  // first read and `ensureStoryNumbers` only ever has to backfill stories
  // written before this field existed.
  const number = nextStoryNumber(config);
  const content = serializeDocument(
    { name, number, created_at: createdAt, created_by: createdBy },
    body.endsWith("\n") ? body : `${body}\n`,
    [...STORY_KEY_ORDER],
  );
  const absPath = join(config.root, path);
  mkdirSync(storiesRoot(config), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return {
    key: storyKey(name),
    name,
    number,
    path,
    body,
    createdAt,
    createdBy,
  };
}

/**
 * Replace an existing definition's name and body in place, keeping its
 * `number`, `created_at` and `created_by`. The PM flesh-out uses this to swap
 * the placeholder written at submit time for the generated story. When the new
 * name slugs differently the file is renamed to match; `previousPath` is set
 * then so the caller can commit the removal too.
 */
export function rewriteStoryDefinition(
  config: RepoOSConfig,
  path: string,
  input: { name: string; body: string },
): { definition: StoryDefinition; previousPath?: string } {
  const absOld = join(config.root, path);
  if (!existsSync(absOld)) throw new Error(`story definition not found: ${path}`);
  const current = parseStoryDefinitionFile(readFileSync(absOld, "utf8"), path);
  if (!current) throw new Error(`story definition is unreadable: ${path}`);
  const name = normalizeStoryName(input.name);
  if (!name) throw new Error("story name is required");
  const body = input.body.trim();
  if (!body) throw new Error("story description is required");
  const clash = findStoryDefinitionByKey(config, storyKey(name));
  if (clash && clash.path !== path) {
    throw new Error(`A story named "${clash.name}" already exists`);
  }
  const nextPath =
    storySlug(name) === storySlug(current.name) ? path : collisionFreeStoryPath(config, name, path);
  // The number survives a rename — that is the whole point of having one. The
  // PM agent rewrites both the name and the file path when it fleshes a story
  // out, and every deeplink already handed out points at the number. A story
  // written before #0515 and not yet reached by the boot migration still gets
  // one here rather than being rewritten with an empty field.
  const number = current.number || nextStoryNumber(config);
  const content = serializeDocument(
    { name, number, created_at: current.createdAt, created_by: current.createdBy },
    `${body}\n`,
    [...STORY_KEY_ORDER],
  );
  writeFileSync(join(config.root, nextPath), content, "utf8");
  if (nextPath !== path) unlinkSync(absOld);
  return {
    definition: {
      key: storyKey(name),
      name,
      number,
      path: nextPath,
      body,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
    },
    previousPath: nextPath !== path ? path : undefined,
  };
}

export interface ParsedGeneratedStory {
  name: string;
  body: string;
  /** Ids of existing tasks the PM judged part of this story. */
  taskIds: string[];
  hadFrontmatter: boolean;
}

/** An existing task the PM may pull into a new story. */
export interface StoryTaskCandidate {
  id: string;
  title: string;
  status: string;
}

export function storyFreeformPrompt(
  humanName: string,
  description: string,
  candidates: StoryTaskCandidate[] = [],
): string {
  const nameHint =
    humanName.trim().length > 0
      ? `The human already chose the story name: "${normalizeStoryName(humanName)}". Use that exact name in frontmatter.`
      : "The human did not provide a name — propose a concise story name in frontmatter.";
  const taskList = candidates.length
    ? [
        "",
        "Existing tasks that are not yet tagged with any story (id · status · title).",
        "If any of them clearly belong to this story, list their ids in a `tasks`",
        "frontmatter list. Leave it out (or empty) when none fit — only include a",
        "task you are confident belongs here.",
        "",
        ...candidates.map((t) => `${t.id} · ${t.status} · ${t.title.replace(/\s+/g, " ")}`),
      ]
    : [];
  return [
    "You are the PM agent for RepoOS. Turn the user's freeform description into a",
    "story definition: a delivery slice that may later be broken into tasks tagged",
    "with the same story name. This is NOT a task file — no id, status, branch, or",
    "assignee.",
    "",
    nameHint,
    "",
    "The user's description:",
    "",
    "```",
    description.trim(),
    "```",
    ...taskList,
    "",
    "Respond with a frontmatter block and markdown body only, like:",
    "---",
    "name: Project updates email",
    'tasks: ["0123", "0456"]',
    "---",
    "",
    "# Project updates email",
    "",
    "Scope, outcomes, non-goals, and open questions in helpful PM prose.",
    "",
    "Do NOT include created_at or created_by — the system sets those.",
    "Respond with ONLY the frontmatter block and body, starting with '---', with no",
    "preamble, commentary, or code fences.",
  ].join("\n");
}

function parseTaskIds(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,]+/) : [];
  const ids = items
    .map((v) =>
      String(v ?? "")
        .replace(/^#/, "")
        .trim(),
    )
    .filter((v) => /^\d+$/.test(v))
    .map((v) => v.padStart(4, "0"));
  return [...new Set(ids)];
}

export function parseGeneratedStoryDefinition(
  rawOutput: string,
  humanName: string,
  rawDescription: string,
): ParsedGeneratedStory {
  // Agents sometimes wrap the whole answer in a ```markdown fence despite the
  // prompt; unwrap it so the frontmatter is still found.
  const trimmed = rawOutput.trim();
  const fenced = trimmed.match(/^```[a-z]*\n([\s\S]*?)\n```$/i);
  const { data, body, hadFrontmatter } = parseDocument(fenced ? fenced[1].trim() : trimmed);
  const fromFm =
    typeof data.name === "string" && data.name.trim() ? normalizeStoryName(data.name) : "";
  const human = normalizeStoryName(humanName);
  if (hadFrontmatter && (fromFm || body.trim())) {
    return {
      // The human's explicit name always wins over the PM's proposal.
      name: human || fromFm || fallbackStoryName(rawDescription),
      body: body.trim() || rawDescription.trim(),
      taskIds: parseTaskIds(data.tasks),
      hadFrontmatter: true,
    };
  }
  return {
    name: human || fallbackStoryName(rawDescription),
    body: rawDescription.trim(),
    taskIds: [],
    hadFrontmatter: false,
  };
}
