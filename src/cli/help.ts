/**
 * `repoos help` and per-command `repoos <cmd> --help` (#0591).
 *
 * The single command table below drives both surfaces, so the top-level help
 * and a command's own usage can never drift apart. Top-level help groups
 * commands under headings and shows the command name only in the left column;
 * flags get their own dim wrapped line under the description, and the full
 * usage line lives in per-command help rather than inline.
 */
import { readVersion } from "../core/version.js";
import { c } from "./colors.js";
import { table, termWidth, visibleWidth, wrap } from "./layout.js";

interface CommandEntry {
  /** Command as typed, e.g. "doctor". */
  name: string;
  /** Full usage (without the leading `repoos`) — per-command help. */
  usage: string;
  /** One-line purpose, shown in the table. */
  desc: string;
  /** Flag summary for the dim line under the description, if any. */
  flags?: string;
}

interface CommandGroup {
  name: string;
  commands: CommandEntry[];
}

/** Commands whose own argument parser already handles `--help`. */
export const SELF_HELP_COMMANDS = new Set(["support", "tunnel", "shot", "uninstall"]);

const GROUPS: readonly CommandGroup[] = [
  {
    name: "Setup",
    commands: [
      {
        name: "init",
        usage: "init [name]",
        desc: "Scaffold work/, repoos.toml, AGENTS.md; guided flow for a new project",
      },
      {
        name: "upgrade",
        usage: "upgrade [--channel beta|canary|rc]",
        desc: "Self-update a standalone (curl-installed) repoos",
        flags: "--channel beta|canary|rc",
      },
      {
        name: "uninstall",
        usage: "uninstall [--yes]",
        desc: "Remove the standalone (curl-installed) repoos from this machine",
        flags: "--yes",
      },
    ],
  },
  {
    name: "Tasks",
    commands: [
      {
        name: "list",
        usage: "list [status] [--json]",
        desc: "Show the board, or one status column",
        flags: "positional: inbox|ready|active|review|done · --json",
      },
      { name: "show", usage: "show <id>", desc: "Show a task's full spec" },
      {
        name: "new",
        usage: 'new "<title>" [--ai --type <t> --area <a> --priority <p> --body <b>]',
        desc: "Create a task",
        flags: "--ai --type --area --priority --body",
      },
      {
        name: "new-doc",
        usage: 'new-doc "<desc>"',
        desc: "Create a document from a description via the PM agent",
      },
      {
        name: "note",
        usage: 'note <id> "<text>"',
        desc: "Append a note to a task's activity log",
      },
      {
        name: "mv",
        usage: "mv <id> <status> [--note <text>] [--force-not-merged]",
        desc: "Move a task to a new status — never merges code",
        flags: '--note "..." · --force-not-merged',
      },
      {
        name: "update",
        usage: "update <id> [flags]",
        desc: "Edit a task's metadata or body",
        flags: "--title --area --priority --type --body --branch --assigned-to",
      },
      {
        name: "index",
        usage: "index [--json]",
        desc: "Rebuild the derived index cache",
        flags: "--json",
      },
      {
        name: "gc",
        usage: "gc [--yes|--dry-run]",
        desc: "Collect leaked task worktrees and branches",
        flags: "--yes · --dry-run",
      },
    ],
  },
  {
    name: "Health",
    commands: [
      {
        name: "status",
        usage: "status [--json]",
        desc: "One-screen health snapshot: server, build, board, worktrees, tunnel, git",
        flags: "--json",
      },
      {
        name: "check",
        usage: "check [--profile <name>] [--changed <ref>] [--print-plan] [--local-tests]",
        desc: "Definition-of-done gate: runs the plan declared in repoos.toml",
        flags: "--profile <name> · --changed <ref> · --print-plan · --local-tests",
      },
      {
        name: "doctor",
        usage: "doctor [--json] [--verbose] [--probe <cli>] [--binary <path>]",
        desc: "Readiness preflight: config, layout, tools, server and secrets",
        flags: "--json · --verbose · --probe <cli> · --binary <path>",
      },
      {
        name: "certify",
        usage: "certify <cli> [--yes] [--json] [--binary <path>]",
        desc: "Run the adapter contract suite and record certification evidence",
        flags: "--yes · --json · --binary <path>",
      },
      {
        name: "support",
        usage: "support [bundle|inspect] [--dry-run|--out <path>|--json]",
        desc: "Write or inspect a redacted diagnostic bundle",
        flags: "bundle: --dry-run --out <path> · inspect: --json",
      },
    ],
  },
  {
    name: "Server",
    commands: [
      {
        name: "serve",
        usage: "serve [--port N] [--host <h>] [--no-tailscale-https] [--quiet]",
        desc: "Start the local server (live API + SSE stream)",
        flags:
          "--port N · --host <h> · --no-tailscale-https · --preview-overrides · --no-preview-overrides · --quiet",
      },
      {
        name: "stop",
        usage: "stop [--port N]",
        desc: "Stop this repo's serve process (by its own lockfile)",
        flags: "--port N",
      },
      {
        name: "service",
        usage: "service <sub>",
        desc: "Manage background services",
        flags: "list|status|install|start|stop|restart|enable|disable|remove|health",
      },
      {
        name: "tunnel",
        usage: "tunnel <sub> [--config <path>] [--output <path>] [--overwrite-dns]",
        desc: "Publish local apps via Cloudflare Tunnel + Zero Trust",
        flags: "setup|create|allow|deny|rename|destroy|start|install|stop|list|status",
      },
      {
        name: "shot",
        usage: "shot [<route|url>] [--target <t>] [--selector <css>] [--task <id>]",
        desc: "Capture preview screenshots into the task's shots folder",
        flags: "--target --selector --task --base --wait --viewport --full-page",
      },
    ],
  },
];

interface Example {
  cmd: string;
  comment?: string;
}

const EXAMPLES: readonly Example[] = [
  { cmd: "repoos init" },
  { cmd: "repoos init myproject", comment: "guided new-project flow outside a git repo" },
  {
    cmd: 'repoos new "Add company dashboard" --ai --type feature --area web,server --priority p1',
  },
  { cmd: 'repoos new-doc "API design doc for the payment system"' },
  { cmd: "repoos mv 0012 active" },
  { cmd: 'repoos mv 0012 active --note "Fix the regression in checkout; see review"' },
  { cmd: 'repoos note 0012 "Handle the reviewer\'s suggestions before the next review"' },
  { cmd: 'repoos update 0012 --title "New title" --area web,core' },
  { cmd: "repoos list ready" },
  { cmd: "repoos doctor", comment: "passing checks are hidden; --verbose shows all" },
  { cmd: "repoos shot", comment: "screenshot the task preview for the current worktree" },
  { cmd: "repoos shot /repo/commits/abc123", comment: "capture one route" },
  { cmd: "repoos shot --target 'Docs site' --selector '.sidebar'" },
  { cmd: "repoos status", comment: "one-screen health snapshot" },
  { cmd: "repoos status --json", comment: "machine-readable, for agents/tools" },
  { cmd: "repoos index --json", comment: "machine-readable, for agents/tools" },
  { cmd: "repoos serve", comment: "live API + SSE at http://127.0.0.1:7171" },
];

/** Full usage for a command (without the leading `repoos`), or null. */
export function commandUsage(name: string): string | null {
  for (const group of GROUPS) {
    for (const cmd of group.commands) if (cmd.name === name) return cmd.usage;
  }
  return null;
}

/** One EXAMPLES row, wrapping the command and moving its comment down if needed. */
function renderExample(ex: Example, width: number): string {
  const indent = "  ";
  const base = c.dim("$") + " " + ex.cmd;
  const comment = ex.comment ? c.dim("# " + ex.comment) : "";
  const fitsOnOneLine =
    !ex.comment || visibleWidth(indent) + visibleWidth(base) + 2 + visibleWidth(comment) <= width;
  if (fitsOnOneLine) {
    return wrap(base + (comment ? "  " + comment : ""), width - indent.length, indent);
  }
  const commentIndent = "      ";
  return [
    wrap(base, width - indent.length, indent),
    wrap(comment, width - commentIndent.length, commentIndent),
  ].join("\n");
}

/**
 * The full `repoos help` text at `width` — grouped command table plus
 * examples. Returns a string so it is unit-testable at fixed widths.
 */
export function renderHelp(width: number = termWidth()): string {
  const lines: string[] = [""];
  lines.push(
    wrap(
      `${c.bold(c.cyan("RepoOS"))} ${c.dim("v" + readVersion())} — the repo is the operating system`,
      width - 2,
      "  ",
    ),
  );
  lines.push("");
  lines.push("  " + c.bold("USAGE"));
  lines.push("    repoos <command> [args]");
  lines.push("    repoos <command> --help");
  lines.push(
    ...wrap(c.dim("full usage and flags for one command"), Math.max(1, width - 6), "      ").split(
      "\n",
    ),
  );
  for (const group of GROUPS) {
    lines.push("");
    lines.push("  " + c.bold(group.name));
    lines.push(
      table(
        group.commands.map((cmd) => ({
          label: c.cyan(cmd.name),
          description: cmd.desc + (cmd.flags ? "\n" + c.dim("flags: " + cmd.flags) : ""),
        })),
        { indent: 4, gap: 2, width },
      ),
    );
  }
  lines.push("");
  lines.push("  " + c.bold("EXAMPLES"));
  for (const ex of EXAMPLES) lines.push(renderExample(ex, width));
  lines.push("");
  return lines.join("\n");
}

export function printHelp(width: number = termWidth()): void {
  console.log(renderHelp(width));
}

/**
 * Print `repoos <name> --help`. Returns false when `name` is not a known
 * command (so the caller can fall through to its normal dispatch).
 */
export function printCommandHelp(name: string, width: number = termWidth()): boolean {
  for (const group of GROUPS) {
    const cmd = group.commands.find((entry) => entry.name === name);
    if (!cmd) continue;
    const lines: string[] = [""];
    lines.push(...wrap(c.bold("repoos") + " " + cmd.usage, width - 2, "  ").split("\n"));
    lines.push(...wrap(cmd.desc, width - 2, "  ").split("\n"));
    if (cmd.flags) {
      lines.push(...wrap(c.dim("flags: " + cmd.flags), width - 2, "  ").split("\n"));
    }
    lines.push("");
    console.log(lines.join("\n"));
    return true;
  }
  return false;
}
