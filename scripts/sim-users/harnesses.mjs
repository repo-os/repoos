// One adapter per simulated-user harness. The flags mirror the drivers in
// src/server/agents.ts (cliCommand/modelArgs) and the model ids RepoOS has
// already run with (see .repoos/index.json), so what works there works here.
// Each build() returns { cmd, args } to spawn with cwd = the run's project dir.

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
      ],
    }),
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
      ],
    }),
  },
  "opencode-deepseek": {
    bin: "opencode",
    model: "openrouter/deepseek/deepseek-v4.1-flash",
    build: (prompt, { model }) => ({
      cmd: "opencode",
      args: ["run", "--format", "json", "--model", model, "--auto", prompt],
    }),
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
          prompt,
        ],
      };
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
