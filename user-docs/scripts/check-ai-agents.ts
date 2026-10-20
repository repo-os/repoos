#!/usr/bin/env bun
/**
 * Build assertion for the agent getting-started guide.
 *
 * The guide embeds the canonical starter prompt with VitePress's snippet
 * syntax (`<<< ../agent/starter-prompt.md`). That keeps one copy of the text,
 * but it also means a broken include, a stale build, or someone pasting a
 * second copy could drift silently. This check compares the prompt in the
 * rendered page and in the raw Markdown copy against `agent/starter-prompt.md`,
 * and confirms the guide keeps the links and permission guidance the task
 * promises. It runs after `vitepress build`, alongside `check-llms.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const docsRoot = path.resolve(import.meta.dir, "..");
const repoRoot = path.resolve(docsRoot, "..");
const distRoot = path.join(docsRoot, ".vitepress", "dist");
const sourcePath = path.join(docsRoot, "ai-agents.md");
const promptPath = path.join(repoRoot, "agent", "starter-prompt.md");
const failures: string[] = [];

const fail = (message: string): void => {
  failures.push(message);
};

const read = (absolute: string, label: string): string => {
  if (!existsSync(absolute)) {
    fail(`missing ${label} (${path.relative(repoRoot, absolute)})`);
    return "";
  }
  return readFileSync(absolute, "utf8");
};

const normalize = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();

const decodeEntities = (html: string): string =>
  html
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const textContent = (html: string): string =>
  decodeEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();

const source = read(sourcePath, "user-docs/ai-agents.md");
const prompt = read(promptPath, "agent/starter-prompt.md");
const html = read(path.join(distRoot, "ai-agents.html"), "built /ai-agents page");
const rawMarkdown = read(path.join(distRoot, "ai-agents.md"), "raw /ai-agents.md copy");

if (existsSync(path.join(docsRoot, "getting-started", "ai-agents.md"))) {
  fail("user-docs/getting-started/ai-agents.md exists; /ai-agents must be a flat page");
}

// The source must embed the prompt through the canonical file, not a pasted copy.
if (!/^<<<\s+[^\n]*agent\/starter-prompt\.md\s*$/m.test(source)) {
  fail(
    "user-docs/ai-agents.md does not include the prompt with a `<<< .../agent/starter-prompt.md` snippet",
  );
}
if (source.includes("You are working in a Git repository where the owner wants to try RepoOS.")) {
  fail("user-docs/ai-agents.md pastes a second copy of the starter prompt");
}

const expectedPrompt = normalize(prompt);

// Rendered page: find the highlighted code block that holds the prompt.
const promptBlock = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)]
  .map((match) => normalize(decodeEntities(match[1].replace(/<[^>]+>/g, ""))))
  .find((block) => block.includes("# Set up RepoOS in this repository"));
if (promptBlock === undefined) {
  fail("built /ai-agents page has no code block containing the starter prompt");
} else if (promptBlock !== expectedPrompt) {
  fail("the rendered starter prompt differs from agent/starter-prompt.md");
}

// Raw Markdown: the llms generator expands the same snippet, so agents fetching
// /ai-agents.md get the prompt too, not an unresolved include directive.
const rawPromptBlock = [...rawMarkdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```\s*$/gm)]
  .map((match) => normalize(match[1]))
  .find((block) => block.includes("# Set up RepoOS in this repository"));
if (rawPromptBlock === undefined) {
  fail("raw /ai-agents.md has no code block containing the starter prompt");
} else if (rawPromptBlock !== expectedPrompt) {
  fail("the raw /ai-agents.md prompt differs from agent/starter-prompt.md");
}

const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
const requiredLinks = [
  "/llms.txt",
  "/llms-full.txt",
  "https://github.com/repo-os/repoos/tree/main/agent/skill",
  "/getting-started",
  "/getting-started#initialize-a-repo",
  "/cli",
  "/running-with-agents",
];
for (const link of requiredLinks) {
  if (!hrefs.includes(link)) fail(`built /ai-agents page does not link ${link}`);
}

const pageText = textContent(html).toLowerCase();
for (const guidance of [
  "inspect the repository first",
  "preserve existing files and git changes",
  "ask before significant edits",
]) {
  if (!pageText.includes(guidance)) {
    fail(`built /ai-agents page is missing permission guidance: "${guidance}"`);
  }
}

if (failures.length > 0) {
  console.error("\nagent guide check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  "agent guide check passed: /ai-agents matches agent/starter-prompt.md, links the agent " +
    "files, and keeps the permission guidance",
);
