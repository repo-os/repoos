/**
 * Document creation core functions. Mirrors the task creation pattern
 * from src/core/repoos.ts — manual path+content and PM-agent-backed freeform.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { RepoOSConfig, Agent } from "./types.js";
import { parseDocument } from "./frontmatter.js";

export interface CreateDocumentInput {
  path: string;
  content: string;
}

export interface CreateDocumentResult {
  path: string;
  absPath: string;
}

/**
 * Callback for running a prompt via PM agent (e.g. from server/agents.ts).
 * Takes description, returns { path, content } or throws.
 */
export type FreeformDocumentGenerator = (description: string) => Promise<{ path: string; content: string }>;

/**
 * Validates a document path to ensure it stays within docsDir.
 * Rejects absolute paths and paths with ".." traversal.
 */
export function validateDocPath(config: RepoOSConfig, path: string): { valid: boolean; reason?: string } {
  if (!path) return { valid: false, reason: "path is required" };

  if (path.includes("..") || path.startsWith("/")) {
    return { valid: false, reason: "invalid path: no .. or absolute paths" };
  }

  const absPath = join(config.root, path);
  const docsBase = join(config.root, config.docsDir);
  const resolvedPath = resolve(absPath);
  const resolvedBase = resolve(docsBase);

  if (!resolvedPath.startsWith(resolvedBase + "/") && resolvedPath !== resolvedBase) {
    return { valid: false, reason: `path must be under ${config.docsDir}` };
  }

  return { valid: true };
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
  writeFileSync(absPath, input.content, "utf8");

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
