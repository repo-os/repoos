// One adapter per simulated-user harness. The flags mirror the drivers in
// src/server/agents.ts (cliCommand/modelArgs) and the model ids RepoOS has
// already run with (see .repoos/index.json), so what works there works here.
// Each build() returns { cmd, args } to spawn with cwd = the run's project dir.

import { existsSync, copyFileSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Each harness keeps config, memories, skills and plugins under the user's home. To make the
// simulated user "naive", isolate() points the harness at a fresh empty config home and links
// in ONLY the login file, so your global instructions/memories/plugins can't leak in. It returns
// { env, args } to add to the launch. `dir` is a per-run scratch dir outside the project.
function linkAuth(from, toDir, name) {
  const src = join(homedir(), from);
  if (!existsSync(src)) return;
  mkdirSync(toDir, { recursive: true });
  rmSync(join(toDir, name), { force: true });
  symlinkSync(src, join(toDir, name));
}

export const HARNESSES = {
  "claude-haiku": {
    bin: "claude",
    model: "haiku",
    build: (prompt, { model }) => ({
      cmd: "claude",
      args: [
        "-p",
        prompt,
        "--model",
        model,
        "--output-format",
        "stream-json",
        "--verbose",
        "--dangerously-skip-permissions",
        // Skip your user-level settings, all skills/slash commands, MCP servers and saved sessions.
        "--setting-sources",
        "project,local",
        "--disable-slash-commands",
        "--strict-mcp-config",
        "--no-session-persistence",
      ],
    }),
    // Claude keeps its login in the keychain and per-project memory keyed by cwd, so a fresh
    // project dir already starts with no memory; nothing to redirect.
    isolate: () => ({ env: {}, args: [] }),
  },
  "codex-luna": {
    bin: "codex",
    model: "gpt-6-luna",
    build: (prompt, { model }) => ({
      cmd: "codex",
      args: [
        "exec",
        prompt,
        "--model",
        model,
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-rules",
      ],
    }),
    // Fresh CODEX_HOME: no config.toml (trusted-project list, MCP servers, notify hook), no
    // AGENTS.md, no memories_1.sqlite, no skills/plugins. Only auth.json is linked in.
    isolate: (dir) => {
      const home = join(dir, "codex-home");
      linkAuth(".codex/auth.json", home, "auth.json");
      return { env: { CODEX_HOME: home }, args: [] };
    },
  },
  "opencode-deepseek": {
    bin: "opencode",
    model: "openrouter/deepseek/deepseek-v4.1-flash",
    build: (prompt, { model }) => ({
      cmd: "opencode",
      // --standalone: a private server. Without it `opencode run` talks to the shared background
      // service, which has your global config (plugins, system prompt) loaded.
      args: ["run", "--standalone", "--format", "json", "--model", model, "--auto", prompt],
    }),
    // Fresh XDG_CONFIG_HOME: no opencode.json (plugins like caveman-opencode-plugin, custom
    // system prompt, permission rules). The data dir stays real: a fresh XDG_DATA_HOME loses the
    // provider route even with auth.json copied in (`provider.no-route`), and it holds only login
    // and session history, which opencode does not load into a new session's context.
    // OPENCODE_DISABLE_CLAUDE_CODE stops it reading ~/.claude/CLAUDE.md.
    isolate: (dir) => {
      const config = join(dir, "xdg-config");
      mkdirSync(config, { recursive: true });
      return {
        env: { XDG_CONFIG_HOME: config, OPENCODE_DISABLE_CLAUDE_CODE: "1" },
        args: [],
      };
    },
  },
  "pi-deepseek": {
    bin: "pi",
    model: "openrouter/deepseek/deepseek-v4.1-flash",
    build: (prompt, { model }) => {
      // pi takes provider and model separately: `openrouter/<id>` -> --provider openrouter --model <id>.
      const slash = model.indexOf("/");
      return {
        cmd: "pi",
        args: [
          "--mode",
          "json",
          "--provider",
          model.slice(0, slash),
          "--model",
          model.slice(slash + 1),
          "--no-session",
          prompt,
        ],
      };
    },
    // Fresh PI_CODING_AGENT_DIR: only auth.json and the model catalog cache carry over.
    isolate: (dir) => {
      const home = join(dir, "pi-agent");
      linkAuth(".pi/agent/auth.json", home, "auth.json");
      const models = join(homedir(), ".pi/agent/models-store.json");
      if (existsSync(models)) copyFileSync(models, join(home, "models-store.json"));
      return { env: { PI_CODING_AGENT_DIR: home }, args: [] };
    },
  },
  "cursor-composer": {
    bin: "cursor-agent",
    model: "composer-2.5",
    build: (prompt, { model, cwd }) => ({
      cmd: "cursor-agent",
      args: [
        "-p",
        "--output-format",
        "stream-json",
        "--force",
        "--trust",
        "--approve-mcps",
        "--workspace",
        cwd,
        "--model",
        model,
        prompt,
      ],
    }),
    // Cannot be isolated: its login lives outside ~/.cursor (a fresh HOME fails with
    // "Authentication required") and there is no config-dir override. See README "Contamination".
    isolate: () => ({ env: {}, args: [] }),
  },
};

// Global instruction files that would leak your own setup into a "first-time user" run.
export const GLOBAL_INSTRUCTION_FILES = [
  "~/.claude/CLAUDE.md",
  "~/.codex/AGENTS.md",
  "~/.config/opencode/AGENTS.md",
  "~/.pi/agent/AGENTS.md",
  "~/.cursor/rules",
];
