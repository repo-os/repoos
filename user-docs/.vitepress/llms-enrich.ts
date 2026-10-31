import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SITE_ORIGIN, discoverDocsPages, type DocsPage } from "./llms-index";

/**
 * Pages concatenated into `/llms-essentials.txt`. Chosen so an agent can
 * install RepoOS and hand work to another agent without fetching the full
 * manual (`llms-full.txt` is hundreds of kilobytes).
 */
export const ESSENTIAL_SOURCES = [
  "getting-started.md",
  "concepts.md",
  "existing-repo.md",
  "ai-agents.md",
  "agent-skill.md",
] as const;

/** Rough token budget the task asks the essentials bundle to stay under. */
export const ESSENTIALS_TOKEN_BUDGET = 30_000;

export const ESSENTIALS_FILE = "llms-essentials.txt";

export const AGENT_SKILL_RAW_URL =
  "https://raw.githubusercontent.com/repo-os/repoos/main/agent/skill/SKILL.md";

/** ~4 characters per token, the same order-of-magnitude estimate the task uses. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** One sentence an index entry can sit beside, taken from the page body. */
export function describePage(markdown: string): string {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  for (const block of body.split(/\n\s*\n/)) {
    const text = block
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^#{1,6}\s+.*$/gm, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`>#]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 24) continue;
    const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
    const clipped = sentence.length > 180 ? `${sentence.slice(0, 177).trimEnd()}…` : sentence;
    return clipped;
  }
  return "A page in the RepoOS user manual.";
}

/**
 * Fill any docs index bullet that the generator left without a `: description`.
 * Lines that already have one (frontmatter) are left alone.
 */
export function withDescriptions(
  llmsTxt: string,
  descriptions: ReadonlyMap<string, string>,
): string {
  return llmsTxt
    .split("\n")
    .map((line) => {
      const match = line.match(
        /^(- \[[^\]]+\]\((https:\/\/docs\.repoos\.org\/[^)\s]+\.md)\))(.*)$/,
      );
      if (!match) return line;
      const [, link, url, rest] = match;
      if (rest.startsWith(": ") && rest.slice(2).trim() !== "") return line;
      const relative = url.slice(SITE_ORIGIN.length + 1);
      const description = descriptions.get(relative);
      if (!description) return line;
      return `${link}: ${description}`;
    })
    .join("\n");
}

export function renderEssentials(
  sections: { title: string; url: string; markdown: string }[],
): string {
  const parts = [
    "# RepoOS essentials",
    "",
    "> Install RepoOS, learn the concepts, and hand setup to a coding agent. For every other page, fetch https://docs.repoos.org/llms.txt. The whole manual is https://docs.repoos.org/llms-full.txt.",
    "",
  ];
  for (const section of sections) {
    const body = section.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim();
    parts.push("---", "", `# ${section.title}`, "", `Source: ${section.url}`, "", body, "");
  }
  return `${parts.join("\n").trim()}\n`;
}

function titleFrom(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || fallback;
}

/** Rewrite dist/llms.txt descriptions and write dist/llms-essentials.txt. */
export function enrichLlmsOutputs(docsRoot: string, distRoot: string): void {
  const pages = discoverDocsPages(docsRoot);
  const byPath = new Map<string, DocsPage>(pages.map((page) => [page.markdownPath, page]));
  const descriptions = new Map<string, string>();
  for (const page of pages) {
    const absolute = path.join(distRoot, page.markdownPath);
    descriptions.set(page.markdownPath, describePage(readFileSync(absolute, "utf8")));
  }

  const indexPath = path.join(distRoot, "llms.txt");
  const index = withDescriptions(readFileSync(indexPath, "utf8"), descriptions);
  writeFileSync(indexPath, index.endsWith("\n") ? index : `${index}\n`);

  const sections = ESSENTIAL_SOURCES.map((source) => {
    const page = byPath.get(source);
    if (!page) throw new Error(`essentials bundle lists ${source}, which is not a docs page`);
    const markdown = readFileSync(path.join(distRoot, page.markdownPath), "utf8");
    return {
      title: titleFrom(markdown, source),
      url: `${SITE_ORIGIN}/${page.markdownPath}`,
      markdown,
    };
  });
  const essentials = renderEssentials(sections);
  if (estimateTokens(essentials) > ESSENTIALS_TOKEN_BUDGET) {
    throw new Error(
      `${ESSENTIALS_FILE} is about ${estimateTokens(essentials)} tokens, over the ${ESSENTIALS_TOKEN_BUDGET} budget`,
    );
  }
  writeFileSync(path.join(distRoot, ESSENTIALS_FILE), essentials);
}

/** Runs after vitepress-plugin-llms has emitted the index and raw pages. */
export function llmsEnrichPlugin(docsRoot: string) {
  return {
    name: "repoos:llms-enrich",
    apply: "build",
    closeBundle() {
      const distRoot = path.join(docsRoot, ".vitepress", "dist");
      enrichLlmsOutputs(docsRoot, distRoot);
    },
  };
}
