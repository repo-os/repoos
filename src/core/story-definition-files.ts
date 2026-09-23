/**
 * Git-tracked story definition files under `stories/` (#0486). Node-only I/O.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "./types.js";
import { FM_DELIM, parseDocument, serializeDocument } from "./frontmatter.js";
import { normalizeStoryName, storyKey } from "./stories.js";
import type { StoryDefinition } from "./story-display.js";

export const STORIES_DIR = "stories";

function fallbackStoryName(text: string): string {
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

export function storySlug(name: string): string {
  return (
    normalizeStoryName(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 55) || "story"
  );
}

export function collisionFreeStoryPath(config: RepoOSConfig, name: string): string {
  const base = storySlug(name);
  let path = `${STORIES_DIR}/${base}.md`;
  let n = 2;
  while (existsSync(join(config.root, path))) {
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

export interface ParsedGeneratedStory {
  name: string;
  body: string;
  hadFrontmatter: boolean;
}

export function storyFreeformPrompt(humanName: string, description: string): string {
  const nameHint =
    humanName.trim().length > 0
      ? `The human already chose the story name: "${normalizeStoryName(humanName)}". Use that exact name in frontmatter.`
      : "The human did not provide a name — propose a concise story name in frontmatter.";
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
    "",
    "Respond with a frontmatter block and markdown body only, like:",
    "---",
    "name: Project updates email",
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

export function parseGeneratedStoryDefinition(
  rawOutput: string,
  humanName: string,
  rawDescription: string,
): ParsedGeneratedStory {
  const { data, body, hadFrontmatter } = parseDocument(rawOutput.trim());
  const fromFm =
    typeof data.name === "string" && data.name.trim() ? normalizeStoryName(data.name) : "";
  const human = normalizeStoryName(humanName);
  if (hadFrontmatter && (fromFm || body.trim())) {
    return {
      name: fromFm || human || fallbackStoryName(rawDescription),
      body: body.trim() || rawDescription.trim(),
      hadFrontmatter: true,
    };
  }
  return {
    name: human || fallbackStoryName(rawDescription),
    body: rawDescription.trim(),
    hadFrontmatter: false,
  };
}

export type StoryDefinitionGenerator = (input: {
  name: string;
  description: string;
}) => Promise<ParsedGeneratedStory>;

export async function createFreeformStoryDefinition(
  config: RepoOSConfig,
  input: {
    name?: string;
    description: string;
    createdBy?: string;
    generator?: StoryDefinitionGenerator;
  },
): Promise<{ definition: StoryDefinition; fallback: boolean; pmError?: string }> {
  const description = input.description.trim();
  if (!description) throw new Error("description is required");
  const humanName = normalizeStoryName(input.name ?? "");
  if (humanName && findStoryDefinitionByKey(config, storyKey(humanName))) {
    const existing = findStoryDefinitionByKey(config, storyKey(humanName))!;
    throw new Error(`A story named "${existing.name}" already exists`);
  }

  let parsed: ParsedGeneratedStory = {
    name: humanName || fallbackStoryName(description),
    body: description,
    hadFrontmatter: false,
  };
  let fallback = true;
  let pmError: string | undefined;

  if (input.generator) {
    try {
      const generated = await input.generator({ name: humanName, description });
      if (generated.hadFrontmatter) {
        parsed = generated;
        fallback = false;
      } else {
        pmError = "the PM agent did not return a valid story definition";
        parsed = {
          name: humanName || generated.name || fallbackStoryName(description),
          body: description,
          hadFrontmatter: false,
        };
      }
    } catch (err) {
      pmError = err instanceof Error ? err.message : String(err);
      parsed = {
        name: humanName || fallbackStoryName(description),
        body: description,
        hadFrontmatter: false,
      };
    }
  }

  const definition = writeStoryDefinition(config, {
    name: parsed.name,
    body: parsed.body,
    createdBy: input.createdBy,
  });
  return { definition, fallback, pmError };
}
