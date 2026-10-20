import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import {
  INSTALL_COMMANDS,
  compareInstallCommands,
  extractInstallCommands,
  normalizeInstallCommand,
} from "../agent/install-commands.js";

// Re-exported for the tests and for callers that read the published list.
export { INSTALL_COMMANDS };

const DOCS_ORIGIN = "https://docs.repoos.org";
/** Files the docs build generates, so there is no `user-docs/*.md` source. */
const GENERATED_DOCS_FILES = new Set(["llms.txt", "llms-full.txt"]);

// The one committed copy of the starter prompt lives at the repo root, outside
// landing/ and docs/, so the landing build and the docs site can share it.
export function defaultStarterPromptPath(): string {
  const url = import.meta.url;
  // Vite injects the original file URL when it loads this config. Under
  // Vitest the module is served over http, so fall back to the project cwd.
  if (url.startsWith("file:")) return fileURLToPath(new URL("../agent/starter-prompt.md", url));
  return `${process.cwd()}/agent/starter-prompt.md`;
}

/** The repository root, from the plugin file's own location. */
export function defaultRepoRoot(): string {
  const url = import.meta.url;
  if (url.startsWith("file:")) return fileURLToPath(new URL("..", url));
  return process.cwd();
}

/** The one portable Agent Skill directory published for outside agents. */
export const AGENT_SKILL_URL = "https://github.com/repo-os/repoos/tree/main/agent/skill";

/** Raw `SKILL.md`, for agents that fetch a single file rather than a tree. */
export const AGENT_SKILL_RAW_URL =
  "https://raw.githubusercontent.com/repo-os/repoos/main/agent/skill/SKILL.md";

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
- [RepoOS Agent Skill](${AGENT_SKILL_URL}): The portable Agent Skills directory an outside agent can fetch — start at SKILL.md.
- [GitHub repository](https://github.com/repo-os/repoos): Source, releases, and issues.

## Starter prompt

This is the canonical prompt for an outside coding agent. Copy it as-is; it is not tailored per provider.

\`\`\`text
${starterPrompt}
\`\`\`
`;
}

function readText(absolute: string, label: string, failures: string[]): string {
  if (!existsSync(absolute)) {
    failures.push(`missing ${label}`);
    return "";
  }
  return readFileSync(absolute, "utf8");
}

function docsRouteExists(repoRoot: string, route: string): boolean {
  if (GENERATED_DOCS_FILES.has(route)) return true;
  const userDocsRoot = path.join(repoRoot, "user-docs");
  const clean = route.replace(/\.md$/, "");
  if (clean === "") return existsSync(path.join(userDocsRoot, "index.md"));
  return [`${clean}.md`, `${clean}/index.md`].some((relative) =>
    existsSync(path.join(userDocsRoot, relative)),
  );
}

/** Every docs.repoos.org URL in `text` must map to a real user-docs page. */
export function collectLandingLinkFailures(
  text: string,
  label: string,
  repoRoot = defaultRepoRoot(),
): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(/https:\/\/docs\.repoos\.org[^\s)\]"'<>`]*/g)) {
    const url = match[0].replace(/[.,;:]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);

    const pathname = url.slice(DOCS_ORIGIN.length).split("#")[0].split("?")[0];
    const route = pathname.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!docsRouteExists(repoRoot, route)) {
      failures.push(`${label} links ${url}, but that page is not in user-docs/`);
    }
  }

  return failures;
}

/**
 * Collect every agent-file build failure for the landing site.
 *
 * Runs from the plugin's `closeBundle`, after `vite build` has written
 * `dist/llms.txt` and the JS bundle, so `cd landing && bun run build` fails —
 * rather than a separate `repoos check` step — when:
 *   - `landing/dist/llms.txt` is missing;
 *   - its install lines, InstallBox, getting-started, or the skill drift from
 *     the published six commands in agent/install-commands.ts;
 *   - the built call to action no longer embeds agent/starter-prompt.md; or
 *   - a docs.repoos.org link in llms.txt points at a page that does not exist.
 */
export function collectLandingAgentFileFailures(repoRoot = defaultRepoRoot()): string[] {
  const failures: string[] = [];
  const landingRoot = path.join(repoRoot, "landing");
  const distRoot = path.join(landingRoot, "dist");

  const prompt = readText(
    path.join(repoRoot, "agent", "starter-prompt.md"),
    "agent/starter-prompt.md",
    failures,
  ).trim();

  // 1. The generated overview must exist and agree with the published commands.
  const llms = readText(
    path.join(distRoot, "llms.txt"),
    "landing/dist/llms.txt (vite build must emit it)",
    failures,
  );
  if (llms) {
    failures.push(...compareInstallCommands("landing/dist/llms.txt", extractInstallCommands(llms)));
    if (prompt && !llms.includes(`\`\`\`text\n${prompt}\n\`\`\``)) {
      failures.push("landing/dist/llms.txt does not embed agent/starter-prompt.md verbatim");
    }
    failures.push(...collectLandingLinkFailures(llms, "landing/dist/llms.txt", repoRoot));
  }

  // 2. Every hand-written copy of the install commands must match the list.
  const installBox = readText(
    path.join(landingRoot, "src", "components", "InstallBox.vue"),
    "landing/src/components/InstallBox.vue",
    failures,
  );
  if (installBox) {
    const commands = [...installBox.matchAll(/\bcmd:\s*"([^"]+)"/g)].map((match) =>
      normalizeInstallCommand(match[1]),
    );
    failures.push(...compareInstallCommands("landing/src/components/InstallBox.vue", commands));
  }

  const gettingStarted = readText(
    path.join(repoRoot, "user-docs", "getting-started.md"),
    "user-docs/getting-started.md",
    failures,
  );
  if (gettingStarted) {
    failures.push(
      ...compareInstallCommands(
        "user-docs/getting-started.md",
        extractInstallCommands(gettingStarted),
      ),
    );
  }

  const skillInstall = readText(
    path.join(repoRoot, "agent", "skill", "references", "detect-and-install.md"),
    "agent/skill/references/detect-and-install.md",
    failures,
  );
  if (skillInstall) {
    failures.push(
      ...compareInstallCommands(
        "agent/skill/references/detect-and-install.md",
        extractInstallCommands(skillInstall),
      ),
    );
  }

  // 3. The call to action copies the one shared prompt, not a rewritten copy.
  // Landing is a client-rendered Vue app, so the prompt lives in the built JS
  // bundle rather than index.html; every non-empty prompt line must be there.
  const ctaSource = readText(
    path.join(landingRoot, "src", "components", "AgentPromptCta.vue"),
    "landing/src/components/AgentPromptCta.vue",
    failures,
  );
  if (
    ctaSource &&
    (!ctaSource.includes("STARTER_PROMPT_PREVIEW") || !ctaSource.includes("agent/cta"))
  ) {
    failures.push(
      "landing call to action does not render the shared prompt preview from agent/cta.ts",
    );
  }
  if (prompt) {
    const assetsDir = path.join(distRoot, "assets");
    if (!existsSync(assetsDir)) {
      failures.push(
        "landing/dist/assets is missing — the landing build did not emit its JS bundle",
      );
    } else {
      const bundle = readdirSync(assetsDir)
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFileSync(path.join(assetsDir, name), "utf8"))
        .join("\n");
      // Minifiers differ on quoting; decode the escapes they commonly emit.
      const decoded = bundle.replace(/\\n/g, "\n").replace(/\\`/g, "`").replace(/\\"/g, '"');
      const missing = prompt
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .find((line) => !bundle.includes(line) && !decoded.includes(line));
      if (missing !== undefined) {
        failures.push(
          `landing call to action does not embed the shared prompt from agent/starter-prompt.md ` +
            `(missing line: "${missing}")`,
        );
      }
    }
  }

  return failures;
}

export interface LlmsTxtPluginOptions {
  /** Overridable for tests; the build uses the plugin file's repo root. */
  repoRoot?: string;
}

/**
 * Serve /llms.txt in `vite dev` and emit it at the dist root on build, so the
 * Cloudflare Worker serves https://repoos.org/llms.txt as plain text. The
 * `closeBundle` hook then asserts the emitted agent files still agree with the
 * canonical prompt, install list, docs pages, and skill — failing the landing
 * build itself, not a separate check step.
 */
export function llmsTxtPlugin(options: LlmsTxtPluginOptions = {}): Plugin {
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
    closeBundle() {
      const failures = collectLandingAgentFileFailures(options.repoRoot);
      if (failures.length > 0) {
        throw new Error(
          `landing agent-file check failed:\n${failures.map((failure) => `  - ${failure}`).join("\n")}`,
        );
      }
      console.log(
        "landing agent-file check passed: dist/llms.txt, the six install commands, and the shared prompt agree",
      );
    },
  };
}
