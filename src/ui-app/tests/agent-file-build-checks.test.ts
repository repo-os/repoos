import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  INSTALL_COMMANDS,
  compareInstallCommands,
  extractInstallCommands,
} from "../../../agent/install-commands.js";
import { promptPreview } from "../../../agent/prompt-preview.js";
import { renderLlmsTxt } from "../../../landing/vite-plugin-llms-txt.js";
import { collectLandingAgentFileFailures } from "../../../landing/scripts/check-agent-files.js";
import {
  collectAiAgentsFailures,
  collectHomepagePromptFailures,
  collectSkillLinkFailures,
} from "../../../user-docs/scripts/check-ai-agents.js";
import { collectLlmsFailures } from "../../../user-docs/scripts/check-llms.js";

const repoRoot = process.cwd();
const prompt = readFileSync(join(repoRoot, "agent/starter-prompt.md"), "utf8").trim();
const installBlock = INSTALL_COMMANDS.join("\n");

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-agent-check-"));
  roots.push(root);
  return root;
}

function write(root: string, relative: string, contents: string): void {
  const absolute = join(root, relative);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function read(root: string, relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function landingLlms(): string {
  return `# RepoOS

> RepoOS keeps a project's task board in the repository itself.

## Install

\`\`\`bash
${installBlock}
\`\`\`

## Documentation

- [Getting started](https://docs.repoos.org/getting-started)
- [Agent guide](https://docs.repoos.org/ai-agents)

## Starter prompt

\`\`\`text
${prompt}
\`\`\`
`;
}

function landingFixture(): string {
  const root = scratch();
  write(root, "agent/starter-prompt.md", `${prompt}\n`);
  write(
    root,
    "agent/skill/references/detect-and-install.md",
    `# Install\n\n\`\`\`bash\n${installBlock}\n\`\`\`\n`,
  );
  write(
    root,
    "landing/src/components/InstallBox.vue",
    INSTALL_COMMANDS.map(
      (command) => `  { id: "x", label: "x", cmd: "${command.replace("--global", "-g")}" },`,
    ).join("\n"),
  );
  write(
    root,
    "user-docs/getting-started.md",
    `# Getting started\n\n\`\`\`bash\n${installBlock}\n\`\`\`\n`,
  );
  write(root, "user-docs/ai-agents.md", "# Agent guide\n");
  write(root, "user-docs/index.md", "# Home\n");
  write(root, "landing/dist/llms.txt", landingLlms());
  write(root, "landing/dist/assets/main.js", `var prompt=${JSON.stringify(prompt)};`);
  return root;
}

function docsLlms(): string {
  return `# RepoOS

> The repo is the operating system.

Every page below is also published as raw Markdown at the same path with \`.md\` appended — for example https://docs.repoos.org/getting-started.md. The whole manual: https://docs.repoos.org/llms-full.txt

## Documentation

- [Getting started](https://docs.repoos.org/getting-started.md)
`;
}

function docsFixture(): string {
  const root = scratch();
  const docsRoot = join(root, "user-docs");
  const dist = join(docsRoot, ".vitepress/dist");
  write(docsRoot, "getting-started.md", "# Getting started\n");
  write(docsRoot, "index.md", "# Home\n");
  write(dist, "llms.txt", docsLlms());
  write(
    dist,
    "llms-full.txt",
    "# RepoOS\n\n## Getting started\n\nurl: https://docs.repoos.org/getting-started.md\n",
  );
  write(dist, "index.html", "<html><body>home</body></html>");
  write(dist, "getting-started.html", '<html><body><h1 id="install">Install</h1></body></html>');
  write(
    dist,
    "getting-started.md",
    "---\nurl: https://docs.repoos.org/getting-started.md\n---\n# Getting started\n",
  );
  return root;
}

describe("shared install commands", () => {
  it("treats mise's -g and --global spellings as the same command", () => {
    const short = INSTALL_COMMANDS.map((command) => command.replace("--global", "-g"));
    expect(compareInstallCommands("fixture", short)).toEqual([]);
  });

  it("captures only the install lines, not repoos commands", () => {
    const markdown = `\`\`\`bash\n${installBlock}\nrepoos init\nrepoos serve\n\`\`\`\n`;
    expect(extractInstallCommands(markdown)).toHaveLength(INSTALL_COMMANDS.length);
  });

  it("reports a missing and an unexpected command by file", () => {
    const drifted = INSTALL_COMMANDS.map((command) =>
      command.includes("pnpm") ? "pnpm install @repo-os/repoos" : command,
    );
    const failures = compareInstallCommands("user-docs/getting-started.md", drifted);
    expect(failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "user-docs/getting-started.md is missing the published install command: pnpm add -g @repo-os/repoos",
        ),
        expect.stringContaining(
          "user-docs/getting-started.md has an install command that is not published: pnpm install @repo-os/repoos",
        ),
      ]),
    );
  });

  it("keeps the committed landing llms.txt, the skill, and getting-started aligned", () => {
    expect(
      compareInstallCommands("renderLlmsTxt", extractInstallCommands(renderLlmsTxt())),
    ).toEqual([]);

    for (const relative of [
      "user-docs/getting-started.md",
      "agent/skill/references/detect-and-install.md",
    ]) {
      expect(
        compareInstallCommands(relative, extractInstallCommands(read(repoRoot, relative))),
        relative,
      ).toEqual([]);
    }

    const installBox = read(repoRoot, "landing/src/components/InstallBox.vue");
    const commands = [...installBox.matchAll(/\bcmd:\s*"([^"]+)"/g)].map((match) =>
      match[1].replace("mise use -g ", "mise use --global "),
    );
    expect(compareInstallCommands("landing/src/components/InstallBox.vue", commands)).toEqual([]);
  });
});

describe("landing agent-file build check", () => {
  it("passes when the generated file, install copies, and shared prompt agree", () => {
    expect(collectLandingAgentFileFailures(landingFixture())).toEqual([]);
  });

  it("fails when the build did not emit dist/llms.txt", () => {
    const root = landingFixture();
    rmSync(join(root, "landing/dist/llms.txt"));
    expect(collectLandingAgentFileFailures(root)).toContainEqual(
      expect.stringContaining("missing landing/dist/llms.txt"),
    );
  });

  it("fails when an install line drifts from the published commands", () => {
    const root = landingFixture();
    const llmsPath = join(root, "landing/dist/llms.txt");
    writeFileSync(
      llmsPath,
      readFileSync(llmsPath, "utf8").replace(
        "pnpm add -g @repo-os/repoos",
        "pnpm install @repo-os/repoos",
      ),
    );
    expect(collectLandingAgentFileFailures(root)).toContainEqual(
      expect.stringContaining("landing/dist/llms.txt is missing the published install command"),
    );
  });

  it("fails when getting-started drifts, even though the landing copy is fine", () => {
    const root = landingFixture();
    write(
      root,
      "user-docs/getting-started.md",
      "# Getting started\n\n```bash\nbrew install repoos\n```\n",
    );
    expect(collectLandingAgentFileFailures(root)).toContainEqual(
      expect.stringContaining(
        "user-docs/getting-started.md is missing the published install command",
      ),
    );
  });

  it("fails when the built call to action no longer embeds the shared prompt", () => {
    const root = landingFixture();
    write(root, "landing/dist/assets/main.js", "var prompt='a rewritten blurb';");
    expect(collectLandingAgentFileFailures(root)).toContainEqual(
      expect.stringContaining("landing call to action does not embed the shared prompt"),
    );
  });

  it("fails when llms.txt links a docs page that does not exist", () => {
    const root = landingFixture();
    const llmsPath = join(root, "landing/dist/llms.txt");
    writeFileSync(
      llmsPath,
      readFileSync(llmsPath, "utf8").replace(
        "https://docs.repoos.org/getting-started",
        "https://docs.repoos.org/missing-page",
      ),
    );
    expect(collectLandingAgentFileFailures(root)).toContainEqual(
      expect.stringContaining("landing/dist/llms.txt links https://docs.repoos.org/missing-page"),
    );
  });
});

describe("docs agent-file build checks", () => {
  it("passes when llms.txt, llms-full.txt, raw Markdown, and HTML routes agree", () => {
    expect(collectLlmsFailures({ docsRoot: join(docsFixture(), "user-docs") })).toEqual([]);
  });

  it("fails when llms.txt or llms-full.txt is missing", () => {
    const docsRoot = join(docsFixture(), "user-docs");
    rmSync(join(docsRoot, ".vitepress/dist/llms.txt"));
    rmSync(join(docsRoot, ".vitepress/dist/llms-full.txt"));
    const failures = collectLlmsFailures({ docsRoot });
    expect(failures).toContainEqual(expect.stringContaining("missing .vitepress/dist/llms.txt"));
    expect(failures).toContainEqual(
      expect.stringContaining("missing .vitepress/dist/llms-full.txt"),
    );
  });

  it("fails when a raw Markdown link would shadow a missing HTML route", () => {
    const docsRoot = join(docsFixture(), "user-docs");
    rmSync(join(docsRoot, ".vitepress/dist/getting-started.html"));
    const failures = collectLlmsFailures({ docsRoot });
    expect(failures).toContainEqual(
      expect.stringContaining(
        "raw Markdown link https://docs.repoos.org/getting-started.md shadows",
      ),
    );
  });

  it("compares the docs homepage prompt preview with the canonical file", () => {
    const heading = "Building with an AI coding agent?";
    const html = `<h2>${heading}</h2><pre class="agent-cta-preview" aria-label="preview"><code>${promptPreview(
      prompt,
    )}</code></pre>`;
    expect(collectHomepagePromptFailures(html, prompt)).toEqual([]);

    const wrong = `<h2>${heading}</h2><pre class="agent-cta-preview"><code>Set up RepoOS</code></pre>`;
    expect(collectHomepagePromptFailures(wrong, prompt)).toContain(
      "the docs homepage prompt preview differs from agent/starter-prompt.md",
    );
    expect(collectHomepagePromptFailures("<html></html>", prompt)).toContain(
      "built docs homepage has no agent prompt call to action",
    );
  });

  it("resolves the skill's relative links", () => {
    const root = scratch();
    write(root, "SKILL.md", "[What](references/what.md)\n[Missing](references/missing.md)\n");
    write(root, "references/what.md", "[Back](../SKILL.md)\n[Web](https://example.com)\n");
    expect(collectSkillLinkFailures(root)).toEqual([
      "agent/skill/SKILL.md links references/missing.md, but the target does not exist",
    ]);
  });

  it("runs the checks from the two existing build commands", () => {
    const landing = JSON.parse(read(repoRoot, "landing/package.json")) as {
      scripts: Record<string, string>;
    };
    expect(landing.scripts.build).toContain("scripts/check-agent-files.ts");

    const docs = JSON.parse(read(repoRoot, "user-docs/package.json")) as {
      scripts: Record<string, string>;
    };
    expect(docs.scripts.build).toContain("scripts/check-llms.ts");
    expect(docs.scripts.build).toContain("scripts/check-ai-agents.ts");
  });

  it("keeps the committed docs-side installs and skill links valid", () => {
    // The build assertion covers the full collector; this keeps the shared
    // pieces honest in a fresh checkout where no dist/ exists yet.
    const failures = collectAiAgentsFailures({
      docsRoot: join(repoRoot, "user-docs"),
      distRoot: join(repoRoot, "user-docs", ".vitepress", "dist"),
    });
    // Missing build output is expected in a fresh worktree; only the source
    // checks (install commands, skill links) must be clean.
    expect(failures.filter((failure) => failure.includes("install command"))).toEqual([]);
    expect(failures.filter((failure) => failure.includes("agent/skill/"))).toEqual([]);
  });
});
