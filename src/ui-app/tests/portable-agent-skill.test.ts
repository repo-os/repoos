import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commandUsage, renderHelp } from "../../cli/help.js";
import {
  STORY_LIST_USAGE,
  STORY_NEW_USAGE,
  STORY_SHOW_USAGE,
  STORY_UPDATE_USAGE,
} from "../../commands/stories.js";
import { scaffoldInto } from "../../commands/init.js";
import { loadConfig } from "../../core/config.js";
import {
  AGENT_SKILL_RAW_URL,
  AGENT_SKILL_URL,
  INSTALL_COMMANDS,
  renderLlmsTxt,
} from "../../../landing/vite-plugin-llms-txt.js";

const repoRoot = process.cwd();
const skillDir = join(repoRoot, "agent", "skill");

function readSkill(): string {
  return readFileSync(join(skillDir, "SKILL.md"), "utf8");
}

function referenceFiles(): string[] {
  return readdirSync(join(skillDir, "references")).filter((name) => name.endsWith(".md"));
}

function allSkillText(): string {
  return [
    readSkill(),
    ...referenceFiles().map((name) => readFileSync(join(skillDir, "references", name), "utf8")),
  ].join("\n");
}

function frontmatter(markdown: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

/** Every `repoos ...` invocation in fenced lines or inline code spans. */
function repoosInvocations(text: string): string[] {
  // Join line continuations so a flag on the next line stays with its command.
  const joined = text.replace(/\\\n/g, " ");
  const lines = joined
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:\$\s*)?repoos\b/.test(line))
    .map((line) => line.replace(/^\$\s*/, "").replace(/\s+#.*$/, ""));
  const inline = [...joined.matchAll(/`(repoos[^`\n]*)`/g)].map((match) => match[1].trim());
  return [...new Set([...lines, ...inline])];
}

/** Every `repoos <command>` reference in a skill file. */
function referencedCommands(text: string): string[] {
  return repoosInvocations(text)
    .map((line) => /^repoos\s+([a-z][a-z-]*)\b/.exec(line)?.[1])
    .filter((command): command is string => command !== undefined);
}

/** Every `--flag` used by a `repoos` invocation, deduplicated. */
function referencedFlags(text: string): string[] {
  return [
    ...new Set(
      repoosInvocations(text)
        .flatMap((line) => [...line.matchAll(/--[a-z][a-z-]*/g)])
        .map((match) => match[0]),
    ),
  ];
}

const roots: string[] = [];

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-skill-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("portable RepoOS Agent Skill", () => {
  it("has spec-valid frontmatter and keeps SKILL.md short", () => {
    const skill = readSkill();
    const meta = frontmatter(skill);

    expect(meta.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(meta.name).toBe("repoos");
    expect(meta.description.length).toBeGreaterThan(0);
    expect(meta.description.length).toBeLessThanOrEqual(1024);
    expect(meta.license).toBeTruthy();

    // The main file is the progressive-disclosure entry point, not the manual.
    expect(skill.split("\n").length).toBeLessThanOrEqual(120);
    expect(skill.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(900);
  });

  it("links every reference file it ships", () => {
    const skill = readSkill();
    const refs = referenceFiles();
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const name of refs) {
      expect(skill).toContain(`references/${name}`);
      expect(existsSync(join(skillDir, "references", name))).toBe(true);
    }
  });

  it("covers what RepoOS does, detection, install, init layout, tasks, stories, and Git safety", () => {
    const text = allSkillText();

    // What RepoOS does and where its records live.
    expect(text).toContain("repoos/work/");
    expect(text).toContain("repoos/docs/");
    expect(text).toContain("AGENTS.md");
    expect(text).toContain("repoos.toml");
    expect(text).toContain("inbox → ready → active → review → done");

    // Detect an existing install: a binary on PATH and repoos.toml in the repo.
    expect(text).toContain("command -v repoos");
    expect(text).toContain("test -f repoos.toml");

    // The six install commands, exactly as published in getting-started.
    for (const command of INSTALL_COMMANDS) expect(text).toContain(command);

    // Init, the default namespaced layout, and non-interactive new-project flags.
    expect(text).toContain("repoos init");
    expect(text).toContain("repoos init myproject --new");
    expect(text).toContain("--layout /");

    // Command discovery and board writes.
    expect(text).toContain("repoos --help");
    expect(text).toContain("repoos new --help");
    expect(text).toContain("https://docs.repoos.org/cli");
    expect(text).toContain('repoos new "');
    expect(text).toContain("repoos story new");
    expect(text).toContain("repoos story list");
    expect(text).toContain("repoos story show");
    expect(text).toContain("repoos story update");

    // Leave unrelated Git work alone.
    for (const rule of ["git status", "git add -A", "git reset", "git clean", "git stash"]) {
      expect(text).toContain(rule);
    }
  });

  it("only names commands the current CLI accepts", () => {
    const commands = referencedCommands(allSkillText());
    expect(commands.length).toBeGreaterThan(0);
    for (const command of new Set(commands)) {
      // `repoos version` is a command; `--version` is its flag form.
      if (command === "version") continue;
      expect(commandUsage(command), `unknown command: repoos ${command}`).not.toBeNull();
    }
    for (const required of ["init", "serve", "new", "list", "show", "mv", "story"]) {
      expect(commands).toContain(required);
    }
  });

  it("only names flags that appear in current CLI help", () => {
    // Story subcommands document --name in their own usage, not the top-level summary.
    const storyHelp = [
      STORY_NEW_USAGE,
      STORY_LIST_USAGE,
      STORY_SHOW_USAGE,
      STORY_UPDATE_USAGE,
    ].join("\n");
    const help = renderHelp(400) + "\n" + storyHelp;
    for (const flag of referencedFlags(allSkillText())) {
      if (flag === "--version") continue; // accepted alias of `repoos version`
      expect(help, `--help no longer documents ${flag}`).toContain(flag);
    }
  });

  it("matches init's default namespaced layout", () => {
    const root = scratch();
    const result = scaffoldInto(root, "skill fixture", "repoos", "new");
    const config = loadConfig(root);

    expect(config.workDir).toBe("repoos/work");
    expect(config.docsDir).toBe("repoos/docs");
    for (const path of ["repoos/work/", "repoos/docs/", "AGENTS.md", "repoos.toml"]) {
      expect(result.created).toContain(path);
    }

    const text = allSkillText();
    expect(text).toContain(`workDir = "${config.workDir}"`);
    expect(text).toContain(`docsDir = "${config.docsDir}"`);
    for (const path of ["repoos/work/", "repoos/docs/", "AGENTS.md", "repoos.toml"]) {
      expect(text, `skill no longer names the default path ${path}`).toContain(path);
    }
  });

  it("is linked from the landing llms.txt at one public URL", () => {
    expect(AGENT_SKILL_URL).toBe("https://github.com/repo-os/repoos/tree/main/agent/skill");
    expect(AGENT_SKILL_RAW_URL).toBe(
      "https://raw.githubusercontent.com/repo-os/repoos/main/agent/skill/SKILL.md",
    );
    expect(renderLlmsTxt()).toContain(`](${AGENT_SKILL_URL})`);
    expect(allSkillText()).toContain(AGENT_SKILL_URL);
  });

  it("gives the docs llms.txt generator a page that carries the skill URL", () => {
    // The docs index is generated from user-docs/*.md and renders each page's
    // frontmatter description after its link. A page whose description names
    // the skill URL therefore puts it in https://docs.repoos.org/llms.txt
    // without hand-editing llms-full.txt.
    const page = readFileSync(join(repoRoot, "user-docs", "agent-skill.md"), "utf8");
    const meta = frontmatter(page);
    expect(meta.title).toBe("RepoOS Agent Skill");
    expect(meta.description).toContain(AGENT_SKILL_URL);
    expect(page).toContain(AGENT_SKILL_RAW_URL);
    expect(page).toContain("references/");
  });
});
