#!/usr/bin/env bun
/**
 * Build assertion for the agent getting-started guide and the shared prompt.
 *
 * The guide embeds the canonical starter prompt with VitePress's snippet
 * syntax (`<<< ../agent/starter-prompt.md`). That keeps one copy of the text,
 * but it also means a broken include, a stale build, or someone pasting a
 * second copy could drift silently. This check compares the prompt in the
 * rendered page and in the raw Markdown copy against `agent/starter-prompt.md`,
 * compares the docs homepage call to action with the same file, resolves the
 * internal links in the guide and the skill, and confirms the docs-side install
 * commands still match the published list. It runs after `vitepress build`,
 * alongside `check-llms.ts`.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cta from "../../agent/cta.json";
import { compareInstallCommands, extractInstallCommands } from "../../agent/install-commands";
import { promptPreview } from "../../agent/prompt-preview";
import { SITE_ORIGIN } from "../.vitepress/llms-index";

const defaultDocsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface AiAgentsCheckOptions {
  docsRoot?: string;
  repoRoot?: string;
  distRoot?: string;
  skillDir?: string;
}

export function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export function textContent(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The rendered preview inside the shared agent call to action, if present. */
export function extractAgentCtaPreview(html: string): string | null {
  const match = /<pre[^>]*class="[^"]*agent-cta-preview[^"]*"[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  if (match === null) return null;
  const code = match[1].replace(/<\/?code[^>]*>/gi, "");
  return normalizeWhitespace(decodeHtmlEntities(code.replace(/<[^>]+>/g, "")));
}

/**
 * The docs homepage renders the same compact preview as the landing page. It
 * must be the opening of `agent/starter-prompt.md`, not a rewritten blurb.
 */
export function collectHomepagePromptFailures(homeHtml: string, prompt: string): string[] {
  const preview = extractAgentCtaPreview(homeHtml);
  if (preview === null) {
    return ["built docs homepage has no agent prompt call to action"];
  }

  const failures: string[] = [];
  if (normalizeWhitespace(preview) !== normalizeWhitespace(promptPreview(prompt))) {
    failures.push("the docs homepage prompt preview differs from agent/starter-prompt.md");
  }
  if (!textContent(homeHtml).includes(cta.heading)) {
    failures.push(
      `the docs homepage call to action is missing its shared heading "${cta.heading}"`,
    );
  }
  return failures;
}

/** Resolve an internal href to a file in the built docs tree, or null. */
export function resolveDocsHref(distRoot: string, href: string): string | null {
  let target = href;
  if (target.startsWith(SITE_ORIGIN)) {
    target = target.slice(SITE_ORIGIN.length);
  } else if (!target.startsWith("/")) {
    return null;
  }

  const pathname = target.split("#")[0].split("?")[0];
  const clean = decodeURIComponent(pathname).replace(/^\/+/, "").replace(/\/+$/, "");
  if (clean === "") {
    return existsSync(path.join(distRoot, "index.html")) ? "index.html" : null;
  }
  if (/\.[A-Za-z0-9]+$/.test(clean)) {
    return existsSync(path.join(distRoot, clean)) ? clean : null;
  }

  const html = `${clean}.html`;
  if (existsSync(path.join(distRoot, html))) return html;
  const nested = `${clean}/index.html`;
  if (existsSync(path.join(distRoot, nested))) return nested;
  return null;
}

/** Every same-origin link must resolve, including its `#anchor`. */
export function collectInternalLinkFailures(
  label: string,
  hrefs: readonly string[],
  distRoot: string,
): string[] {
  const failures: string[] = [];

  for (const href of new Set(hrefs)) {
    if (!href || href.startsWith("#") || /^(?:mailto|javascript):/i.test(href)) continue;
    if (!href.startsWith(SITE_ORIGIN) && !href.startsWith("/")) continue;

    const file = resolveDocsHref(distRoot, href);
    if (file === null) {
      failures.push(`${label} links ${href}, which is not in the docs build`);
      continue;
    }

    const hash = href.split("#")[1];
    if (hash && file.endsWith(".html")) {
      const id = decodeURIComponent(hash);
      const html = readFileSync(path.join(distRoot, file), "utf8");
      if (!html.includes(`id="${id}"`)) {
        failures.push(`${label} links ${href}, but that anchor is missing from ${file}`);
      }
    }
  }

  return failures;
}

/** Targets of Markdown links (`[text](target)`), including images. */
export function markdownLinkTargets(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]);
}

/** The skill ships relative links to its references; every one must exist. */
export function collectSkillLinkFailures(skillDir: string): string[] {
  const failures: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      if (!entry.name.endsWith(".md")) continue;

      const label = `agent/skill/${path.relative(skillDir, absolute).split(path.sep).join("/")}`;
      const text = readFileSync(absolute, "utf8");
      for (const href of markdownLinkTargets(text)) {
        // Absolute URLs, protocol links, and in-page anchors are not relative.
        if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) continue;
        const clean = href.split("#")[0];
        if (!clean) continue;
        const target = path.resolve(path.dirname(absolute), decodeURIComponent(clean));
        if (!existsSync(target)) {
          failures.push(`${label} links ${href}, but the target does not exist`);
        }
      }
    }
  };

  if (!existsSync(skillDir)) return [`missing agent/skill directory (${skillDir})`];
  walk(skillDir);
  return failures;
}

/** Collect every failure for the agent guide, homepage CTA, skill, and installs. */
export function collectAiAgentsFailures(options: AiAgentsCheckOptions = {}): string[] {
  const docsRoot = options.docsRoot ?? defaultDocsRoot;
  const repoRoot = options.repoRoot ?? path.resolve(docsRoot, "..");
  const distRoot = options.distRoot ?? path.join(docsRoot, ".vitepress", "dist");
  const skillDir = options.skillDir ?? path.join(repoRoot, "agent", "skill");
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

  const sourcePath = path.join(docsRoot, "ai-agents.md");
  const promptPath = path.join(repoRoot, "agent", "starter-prompt.md");
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
  // Identify the block by the canonical prompt's own first line, not a second
  // hard-coded heading. A prompt rewrite left this check's literal sentinel
  // behind and failed the docs build; the canonical file is the source of
  // truth, so derive the sentinel from it.
  const promptStart = expectedPrompt.split("\n")[0]!.trim();

  // Rendered page: find the highlighted code block that holds the prompt.
  const promptBlock = [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)]
    .map((match) => normalize(decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ""))))
    .find((block) => promptStart !== "" && block.includes(promptStart));
  if (promptBlock === undefined) {
    fail("built /ai-agents page has no code block containing the starter prompt");
  } else if (promptBlock !== expectedPrompt) {
    fail("the rendered starter prompt differs from agent/starter-prompt.md");
  }

  // Raw Markdown: the llms generator expands the same snippet, so agents fetching
  // /ai-agents.md get the prompt too, not an unresolved include directive.
  const rawPromptBlock = [...rawMarkdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```\s*$/gm)]
    .map((match) => normalize(match[1]))
    .find((block) => promptStart !== "" && block.includes(promptStart));
  if (rawPromptBlock === undefined) {
    fail("raw /ai-agents.md has no code block containing the starter prompt");
  } else if (rawPromptBlock !== expectedPrompt) {
    fail("the raw /ai-agents.md prompt differs from agent/starter-prompt.md");
  }

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => decodeHtmlEntities(match[1]));
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

  // The homepage call to action uses the same preview as the landing page.
  const homeHtml = read(path.join(distRoot, "index.html"), "built docs homepage");
  if (homeHtml && prompt) {
    failures.push(...collectHomepagePromptFailures(homeHtml, prompt));
  }

  // Every same-origin link must resolve against the built site.
  if (html) {
    failures.push(...collectInternalLinkFailures("built /ai-agents page", hrefs, distRoot));
  }
  if (source) {
    failures.push(
      ...collectInternalLinkFailures(
        "user-docs/ai-agents.md",
        markdownLinkTargets(source),
        distRoot,
      ),
    );
  }
  if (rawMarkdown) {
    failures.push(
      ...collectInternalLinkFailures(
        "raw /ai-agents.md",
        markdownLinkTargets(rawMarkdown),
        distRoot,
      ),
    );
  }

  // The portable skill is published from this repo; its relative links and its
  // install commands must stay intact too.
  failures.push(...collectSkillLinkFailures(skillDir));
  for (const relative of [
    "user-docs/getting-started.md",
    "agent/skill/references/detect-and-install.md",
  ]) {
    const text = read(path.join(repoRoot, relative), relative);
    if (text) {
      failures.push(...compareInstallCommands(relative, extractInstallCommands(text)));
    }
  }

  return failures;
}

if (import.meta.main) {
  const failures = collectAiAgentsFailures();
  if (failures.length > 0) {
    console.error("\nagent guide check failed:");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log(
    "agent guide check passed: /ai-agents and the docs homepage match agent/starter-prompt.md; " +
      "links, the skill, and the install commands resolve",
  );
}
