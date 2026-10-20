import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AGENT_SKILL_URL,
  INSTALL_COMMANDS,
  readStarterPrompt,
  renderLlmsTxt,
} from "../../../landing/vite-plugin-llms-txt.js";

const repoRoot = process.cwd();

describe("landing llms.txt", () => {
  const llms = renderLlmsTxt();

  it("starts with the llmstxt.org shape: H1, blockquote summary, link sections", () => {
    expect(llms.startsWith("# RepoOS\n\n> ")).toBe(true);
    expect(llms).toContain("## Install");
    expect(llms).toContain("## Documentation");
    expect(llms).toMatch(/^- \[Documentation\]\(https:\/\/docs\.repoos\.org\): .+$/m);
  });

  it("publishes the six install commands, including mise's long form", () => {
    for (const command of INSTALL_COMMANDS) expect(llms).toContain(command);
    expect(llms).not.toContain("mise use -g");
  });

  it("links the public docs and repository, but not this repo's docs/ or agents.txt", () => {
    for (const url of [
      "https://docs.repoos.org",
      "https://docs.repoos.org/getting-started",
      "https://docs.repoos.org/cli",
      "https://docs.repoos.org/ai-agents",
      AGENT_SKILL_URL,
      "https://github.com/repo-os/repoos",
    ]) {
      expect(llms).toContain(`](${url})`);
    }
    expect(llms).not.toContain("repo-os/repoos/tree/main/docs");
    expect(llms).not.toContain("agents.txt");
  });

  it("embeds the one canonical starter prompt verbatim", () => {
    const prompt = readStarterPrompt();
    expect(llms).toContain("```text\n" + prompt + "\n```");
    expect(prompt).toContain("https://repoos.org/llms.txt");
    expect(prompt).toContain("https://docs.repoos.org/llms.txt");
    expect(prompt).toContain("Inspect this repository before installing or editing anything");
    expect(prompt).toContain("preserve existing files and uncommitted Git changes");
  });

  it("matches the commands already published in InstallBox and getting-started", () => {
    const installBox = readFileSync(`${repoRoot}/landing/src/components/InstallBox.vue`, "utf8");
    for (const command of INSTALL_COMMANDS.slice(0, 5)) {
      expect(installBox).toContain(`cmd: "${command}"`);
    }
    // `-g` and `--global` are the same mise flag; publish getting-started's long form.
    expect(installBox).toContain('cmd: "mise use -g npm:@repo-os/repoos"');
    const gettingStarted = readFileSync(`${repoRoot}/user-docs/getting-started.md`, "utf8");
    for (const command of INSTALL_COMMANDS) expect(gettingStarted).toContain(command);
  });
});
