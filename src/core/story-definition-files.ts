/**
 * Git-tracked story definition files under `stories/` (#0486). Node-only I/O.
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

export const STORIES_DIR = "stories";

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
  return join(config.root, STORIES_DIR);
}

function isStoryFile(name: string): boolean {
  return name.endsWith(".md") && !name.startsWith(".");
}

/**
 * Story files the PM agent is fleshing out right now (by repo-relative path).
 * In-memory on purpose: a server reload drops the run, and the indicator must
 * clear with it rather than stick. Written by `src/server/story-pm.ts`.
 */
const pmWorking = new Set<string>();

export function setStoryPmWorking(path: string, on: boolean): void {
  if (on) pmWorking.add(path);
  else pmWorking.delete(path);
}

export function isStoryPmWorking(path: string): boolean {
  return pmWorking.has(path);
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
  let path = `${STORIES_DIR}/${base}.md`;
  let n = 2;
  while (path !== ownPath && existsSync(join(config.root, path))) {
    path = `${STORIES_DIR}/${base}-${n}.md`;
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
      const path = `${STORIES_DIR}/${file}`;
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
  if (!path.startsWith(`${STORIES_DIR}/`) || !path.endsWith(".md")) {
    throw new Error("invalid story definition path");
  }
  const createdAt = new Date().toISOString();
  const createdBy = input.createdBy?.trim() || "unknown";
  const content = serializeDocument(
    { name, created_at: createdAt, created_by: createdBy },
    body.endsWith("\n") ? body : `${body}\n`,
  );
  const absPath = join(config.root, path);
  mkdirSync(storiesRoot(config), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return {
    key: storyKey(name),
    name,
    path,
    body,
    createdAt,
    createdBy,
  };
}

/**
 * Replace an existing definition's name and body in place, keeping its
 * `created_at` / `created_by`. The PM flesh-out uses this to swap the
 * placeholder written at submit time for the generated story. When the new
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
  const content = serializeDocument(
    { name, created_at: current.createdAt, created_by: current.createdBy },
    `${body}\n`,
  );
  writeFileSync(join(config.root, nextPath), content, "utf8");
  if (nextPath !== path) unlinkSync(absOld);
  return {
    definition: {
      key: storyKey(name),
      name,
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
