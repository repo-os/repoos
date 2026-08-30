/**
 * Document creation core functions. Mirrors the task creation pattern
 * from src/core/repoos.ts — manual path+content and PM-agent-backed freeform.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RepoOSConfig, Agent } from "./types.js";
import { parseDocument } from "./frontmatter.js";

export interface CreateDocumentInput {
  path: string;
  /** File body. Decoded from base64 to raw bytes when `encoding` is "base64". */
  content: string;
  /** "utf8" (default) writes `content` as text; "base64" writes decoded bytes — for image/PDF/font assets. */
  encoding?: "utf8" | "base64";
}

export interface CreateDocumentResult {
  path: string;
  absPath: string;
}

/**
 * Callback for running a prompt via PM agent (e.g. from server/agents.ts).
 * Takes description, returns { path, content } or throws.
 */
export type FreeformDocumentGenerator = (
  description: string,
) => Promise<{ path: string; content: string }>;

/**
 * Validates a document path to ensure it stays within docsDir.
 * Rejects absolute paths and paths with ".." traversal.
 */
export function validateDocPath(
  config: RepoOSConfig,
  path: string,
): { valid: boolean; reason?: string } {
  if (!path) return { valid: false, reason: "path is required" };

  if (path.includes("..") || path.startsWith("/")) {
    return { valid: false, reason: "invalid path: no .. or absolute paths" };
  }

  if (/[/\\]\s*$/.test(path)) {
    return {
      valid: false,
      reason:
        "path must be a file, not a directory — include the filename (e.g. docs/design/assets/logo.svg)",
    };
  }

  const absPath = join(config.root, path);
  const docsBase = join(config.root, config.docsDir);
  const resolvedPath = resolve(absPath);
  const resolvedBase = resolve(docsBase);

  if (!resolvedPath.startsWith(resolvedBase + "/") && resolvedPath !== resolvedBase) {
    return { valid: false, reason: `path must be under ${config.docsDir}` };
  }

  if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
    return { valid: false, reason: `${path} is an existing directory — include the filename` };
  }

  return { valid: true };
}

/**
 * Turn a human skill name into a directory slug: lowercase, non-alphanumerics
 * collapsed to single dashes, leading/trailing dashes trimmed.
 */
export function skillSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Validates a skill path — must be exactly `<skillsDir>/<slug>/SKILL.md` with a
 * slug of lowercase alphanumerics and dashes. Skills live in their own dir, not
 * under docsDir, so this is a separate check from validateDocPath.
 */
export function validateSkillPath(
  config: RepoOSConfig,
  path: string,
): { valid: boolean; reason?: string } {
  if (!path) return { valid: false, reason: "path is required" };
  if (path.includes("..") || path.startsWith("/")) {
    return { valid: false, reason: "invalid path: no .. or absolute paths" };
  }
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== config.skillsDir || parts[2] !== "SKILL.md") {
    return { valid: false, reason: `path must be ${config.skillsDir}/<name>/SKILL.md` };
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(parts[1])) {
    return { valid: false, reason: "skill name must be lowercase letters, digits and dashes" };
  }
  return { valid: true };
}

/** Double-quote a YAML scalar so colons, quotes and `#` in the value stay safe. */
function yamlQuote(v: string): string {
  return `"${v.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Assemble a SKILL.md body with the required `name` / `description` frontmatter. */
export function buildSkillMarkdown(name: string, description: string, body: string): string {
  const fm = [
    "---",
    `name: ${yamlQuote(name)}`,
    `description: ${yamlQuote(description)}`,
    "---",
    "",
  ].join("\n");
  return `${fm}\n${body.trim()}\n`;
}

/**
 * Create a skill: `<skillsDir>/<slug>/SKILL.md`. When `content` is given it is
 * written verbatim (upload); otherwise frontmatter is assembled from `name` and
 * `description` and prepended to `body` (manual).
 */
export function createSkill(
  config: RepoOSConfig,
  input: { name: string; description?: string; body?: string; content?: string },
): CreateDocumentResult {
  const slug = skillSlug(input.name);
  const path = `${config.skillsDir}/${slug}/SKILL.md`;
  const validation = validateSkillPath(config, path);
  if (!validation.valid) {
    throw new Error(validation.reason || "invalid skill name");
  }
  const content =
    typeof input.content === "string" && input.content.length > 0
      ? input.content
      : buildSkillMarkdown(input.name, input.description ?? "", input.body ?? "");

  const absPath = join(config.root, path);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return { path, absPath };
}

/** Create a skill via the PM agent (freeform), mirroring createFreeformDocument. */
export async function createFreeformSkill(
  config: RepoOSConfig,
  description: string,
  generator: FreeformDocumentGenerator,
): Promise<CreateDocumentResult> {
  const { path, content } = await generator(description);
  if (!path || !content) {
    throw new Error("freeform generator returned unusable output (missing path or content)");
  }
  const validation = validateSkillPath(config, path);
  if (!validation.valid) {
    throw new Error(validation.reason || "invalid skill path from freeform generator");
  }
  const absPath = join(config.root, path);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return { path, absPath };
}

/** Build the PM agent's prompt for authoring a new skill. */
export function skillFreeformPrompt(description: string): string {
  return [
    "You are the PM agent for RepoOS. Turn the user's description into a complete",
    "Claude skill: a single SKILL.md file with YAML frontmatter.",
    "",
    "The user's description:",
    "",
    "```",
    description.trim(),
    "```",
    "",
    "Respond with a frontmatter block giving the destination path, then the SKILL.md",
    "content, like:",
    "---",
    "path: skills/<name>/SKILL.md   # <name> is lowercase letters, digits and dashes",
    "---",
    "---",
    "name: <name>",
    "description: <one-line description of when to use this skill>",
    "---",
    "",
    "# <Title>",
    "Instructions the agent should follow when this skill is active.",
    "",
    "Respond with ONLY the outer frontmatter block and the file content, starting with",
    "the opening '---' line and with no preamble, commentary, or code fences.",
  ].join("\n");
}

/**
 * Create a document with explicit path and content.
 * Validates path to stay within config.docsDir.
 */
export function createDocument(
  config: RepoOSConfig,
  input: CreateDocumentInput,
): CreateDocumentResult {
  const validation = validateDocPath(config, input.path);
  if (!validation.valid) {
    throw new Error(validation.reason || "invalid document path");
  }

  const absPath = join(config.root, input.path);
  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });
  if (input.encoding === "base64") {
    writeFileSync(absPath, Buffer.from(input.content, "base64"));
  } else {
    writeFileSync(absPath, input.content, "utf8");
  }

  return {
    path: input.path,
    absPath,
  };
}

/**
 * Create a document via PM agent (freeform).
 * Calls the provided generator with description, validates result, writes file.
 */
export async function createFreeformDocument(
  config: RepoOSConfig,
  description: string,
  generator: FreeformDocumentGenerator,
): Promise<CreateDocumentResult> {
  const { path, content } = await generator(description);

  if (!path || !content) {
    throw new Error("freeform generator returned unusable output (missing path or content)");
  }

  const validation = validateDocPath(config, path);
  if (!validation.valid) {
    throw new Error(validation.reason || "invalid document path from freeform generator");
  }

  const absPath = join(config.root, path);
  const dir = dirname(absPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(absPath, content, "utf8");

  return {
    path,
    absPath,
  };
}

/** Build the PM agent's prompt from a document description. */
export function docFreeformPrompt(description: string): string {
  return [
    "You are the PM agent for RepoOS. Turn the user's description into a well-formatted,",
    "complete Markdown document.",
    "",
    "The user's description:",
    "",
    "```",
    description.trim(),
    "```",
    "",
    "Respond with a frontmatter block giving the destination path, then the document",
    "body, like:",
    "---",
    "path: docs/my-doc.md   # or e.g. docs/adr/0001-title.md — relative to the repo root",
    "---",
    "",
    "# Title",
    "The rest of the markdown document content goes here.",
    "",
    "Respond with ONLY the frontmatter block and the document content, starting with the",
    "opening '---' line and with no preamble, commentary, or code fences.",
  ].join("\n");
}

/** Parse the PM agent's generated document response (frontmatter `path` + markdown body). */
export function parseGeneratedDocument(output: string): { path: string; content: string } {
  const { data, body, hadFrontmatter } = parseDocument(output.trim());
  const path = hadFrontmatter && typeof data.path === "string" ? data.path.trim() : "";
  const content = body.trim();
  if (path && content) {
    return { path, content };
  }
  return { path: "", content: "" };
}
