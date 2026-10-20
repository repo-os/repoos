import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

// The one committed copy of the starter prompt lives at the repo root, outside
// landing/ and docs/, so the landing build and the docs site can share it.
export function defaultStarterPromptPath(): string {
  const url = import.meta.url;
  // Vite injects the original file URL when it loads this config. Under
  // Vitest the module is served over http, so fall back to the project cwd.
  if (url.startsWith("file:")) return fileURLToPath(new URL("../agent/starter-prompt.md", url));
  return `${process.cwd()}/agent/starter-prompt.md`;
}

// Keep these identical to the published commands in
// landing/src/components/InstallBox.vue and user-docs/getting-started.md.
// mise's long form comes from getting-started; `-g` is the same flag.
export const INSTALL_COMMANDS = [
  "curl -fsSL https://repoos.org/install | bash",
  "brew install repo-os/tap/repoos",
  "npm install -g @repo-os/repoos",
  "bun add -g @repo-os/repoos",
  "pnpm add -g @repo-os/repoos",
  "mise use --global npm:@repo-os/repoos",
] as const;

export function readStarterPrompt(path = defaultStarterPromptPath()): string {
  try {
    return readFileSync(path, "utf8").trim();
  } catch (error) {
    throw new Error(
      `Cannot read the canonical starter prompt at agent/starter-prompt.md (${path}): ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Render the landing llms.txt overview. Exported so tests can assert its shape. */
export function renderLlmsTxt(starterPrompt: string = readStarterPrompt()): string {
  return `# RepoOS

> RepoOS keeps a project's task board in the repository itself: tasks are Markdown files, coding agents work them in isolated Git worktrees, and a person reviews and approves every merge. It is for a small team or an independent developer using a coding agent such as Claude Code, Codex, OpenCode, or Cursor.

RepoOS is local-first, source-available, and has zero runtime dependencies. It runs on Bun, with Node 20+ as a fallback.

## How it works

- Tasks are Markdown files with their status in YAML frontmatter, versioned by Git.
- Each task gets its own branch and Git worktree, and agents work there — never in your main checkout.
- Checks run before handoff, and a person approves the merge. Agents never merge their own work.

## Install

Choose one. curl is the zero-dependency default; the package managers below install the same CLI.

\`\`\`bash
${INSTALL_COMMANDS.join("\n")}
\`\`\`

## Start

\`\`\`bash
repoos init    # scaffold repoos/work/, repoos/docs/, and AGENTS.md by default
repoos serve   # start the board; prints the local URL to open
\`\`\`

## Documentation

- [Documentation](https://docs.repoos.org): The user manual: concepts, configuration, and day-to-day use.
- [Getting started](https://docs.repoos.org/getting-started): Install RepoOS, initialize a repository, and open the board.
- [CLI reference](https://docs.repoos.org/cli): Every command and flag, including tasks, stories, and worktrees.
- [Using RepoOS with an AI coding agent](https://docs.repoos.org/ai-agents): Hand the setup to an agent, with permission guidance and the starter prompt.
- [GitHub repository](https://github.com/repo-os/repoos): Source, releases, and issues.

## Starter prompt

This is the canonical prompt for an outside coding agent. Copy it as-is; it is not tailored per provider.

\`\`\`text
${starterPrompt}
\`\`\`
`;
}

/**
 * Serve /llms.txt in `vite dev` and emit it at the dist root on build, so the
 * Cloudflare Worker serves https://repoos.org/llms.txt as plain text.
 */
export function llmsTxtPlugin(): Plugin {
  return {
    name: "repoos:llms-txt",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || "/", "http://localhost");
        if (url.pathname !== "/llms.txt") return next();
        const body = renderLlmsTxt();
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Cache-Control", "no-cache");
        response.end(body);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "llms.txt",
        source: renderLlmsTxt(),
      });
    },
  };
}
