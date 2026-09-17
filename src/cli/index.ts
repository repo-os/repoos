#!/usr/bin/env node
/**
 * RepoOS CLI entrypoint. Bin name: `repoos`.
 * Dependency-free arg routing — no commander/yargs needed for Stage 1.
 */
import { cmdInit } from "../commands/init.js";
import {
  cmdList,
  cmdShow,
  cmdMv,
  cmdUpdate,
  cmdNew,
  cmdIndex,
  cmdNote,
} from "../commands/tasks.js";
import { cmdNewDoc } from "../commands/docs.js";
import { cmdGc } from "../commands/gc.js";
import { cmdCheck } from "../commands/check.js";
import { cmdServe, serveProcessTitle, setServeProcessTitle } from "../commands/serve.js";
import { cmdStop } from "../commands/stop.js";
import { cmdTunnel } from "../commands/tunnel.js";
import { cmdUpgrade } from "../commands/upgrade.js";
import { cmdUninstall } from "../commands/uninstall.js";
import { cmdStatus } from "../commands/status.js";
import { checkBuild } from "../core/build.js";
import { loadConfig } from "../core/config.js";
import { reexecUnderBunIfRequested } from "../core/runtime.js";
import { c } from "./colors.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// node:sqlite (used by db.ts/auth-store.ts) is still marked experimental on
// supported Node versions and prints a warning the first time it's loaded.
// That's expected/stable usage here, not something a user needs to see —
// suppress just that one warning, leaving everything else intact. Matched on
// message content alone, not warning.name: which exact warning class/name
// Node uses for this varies by version (confirmed — no warning fires on
// instantiation at all on Node 24.19.0, but one does on Node 25.2.1), so a
// name-based filter risks silently failing to match on some future/older
// Node version and falling through to print it anyway.
process.on("warning", (warning) => {
  if (/\bsqlite\b/i.test(warning.message)) return;
  console.warn(warning);
});

/** Reads the version stamped into .build-info.json at build time; falls back for dev/source runs. */
function readVersion(): string {
  try {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const info = JSON.parse(readFileSync(join(root, ".build-info.json"), "utf8")) as {
      version?: string;
    };
    if (info.version) return info.version;
  } catch {
    /* fall through */
  }
  return "0.0.0-dev";
}

const VERSION = readVersion();

// Column where COMMANDS descriptions start, measured from the start of the
// command text (not counting the leading 4-space indent). Wide enough for
// the longest single-line entry ("gc [--yes|--dry-run]", 21 chars) plus a
// 2-space gap. Kept as one constant (rather than hand-counted spaces per
// line) so every row stays aligned when an entry is added or renamed.
const CMD_COL = 23;
const CMD_INDENT = " ".repeat(4 + CMD_COL);

/**
 * A COMMANDS row: `cmd` is plain text (for width math), `desc` may contain
 * ANSI codes. Callers join rows with `"\n    "` — the 4-space indent lives
 * in the join separator (and the template literal for the first row), not
 * here, so a row must not add its own leading indent.
 */
function cmdRow(cmd: string, desc: string): string {
  if (cmd.length >= CMD_COL) {
    // Too long to share a line with its description — command on its own
    // line, description indented to the same column as every other row.
    return `${c.cyan(cmd)}\n${CMD_INDENT}${desc}`;
  }
  return `${c.cyan(cmd)}${" ".repeat(CMD_COL - cmd.length)}${desc}`;
}

// Column where trailing `# comment`s line up in the EXAMPLES block below.
const EX_COL = 28;
/** An EXAMPLES row; see cmdRow's doc comment re: indentation living in the join. */
function exRow(cmd: string, comment?: string): string {
  if (!comment) return `${c.dim("$")} ${cmd}`;
  const pad = " ".repeat(Math.max(1, EX_COL - cmd.length));
  return `${c.dim("$")} ${cmd}${pad}${c.dim("# " + comment)}`;
}

function help(): void {
  const commandLines = [
    cmdRow("check", "Full definition-of-done: build, typecheck, tests, UI smoke check"),
    cmdRow(
      "init [name]",
      "Scaffold work/, repoos.toml, AGENTS.md; outside a git repo runs a guided flow that can launch the web console",
    ),
    cmdRow(
      "list [status]",
      `Show the board (or one column: ${c.dim("inbox|ready|active|review|done")})`,
    ),
    cmdRow(
      "status [--json]",
      "One-screen health snapshot: server, build freshness, board, worktrees, tunnel, git",
    ),
    cmdRow("show <id>", "Show a task's full spec"),
    cmdRow("mv <id> <status>", `Move a task to a new status   ${c.dim('flags: --note "..."')}`),
    cmdRow('note <id> "<text>"', "Append a free-form note to a task's activity log"),
    cmdRow(
      "update <id>",
      `Edit a task's metadata/body   ${c.dim("flags: --title --area --priority --type --body --branch --assigned-to")}`,
    ),
    cmdRow(
      'new "<title>"',
      `Create a task   ${c.dim("flags: --ai --type --area --priority --body")}`,
    ),
    cmdRow('new-doc "<desc>"', "Create a document from a description via PM agent"),
    cmdRow("index [--json]", "Rebuild the derived index cache"),
    cmdRow(
      "gc [--yes|--dry-run]",
      "Collect leaked task worktrees/branches (done/absent tasks, integrate candidates)",
    ),
    cmdRow("serve [--port N]", "Start the local server (live API + SSE stream)"),
    cmdRow("stop [--port N]", "Stop this repo's serve process (by its own lockfile)"),
    cmdRow(
      "tunnel <sub>",
      `Publish local apps via Cloudflare Tunnel + Zero Trust ${c.dim("(setup|create|allow|deny|rename|destroy|start|install|stop|list|status)")}`,
    ),
    cmdRow(
      "upgrade [--channel beta|canary|rc]",
      `Self-update a standalone (curl-installed) repoos to the latest release\n${CMD_INDENT}(stable by default; --channel tracks a prerelease line instead)`,
    ),
    cmdRow("uninstall [--yes]", "Remove the standalone (curl-installed) repoos from this machine"),
  ].join("\n    ");

  const exampleLines = [
    exRow("repoos init"),
    exRow("repoos init myproject", "guided new-project flow outside a git repo"),
    exRow('repoos new "Add company dashboard" --ai --type feature --area web --priority p1'),
    exRow('repoos new-doc "API design doc for the payment system"'),
    exRow("repoos mv 0012 active"),
    exRow('repoos mv 0012 active --note "Fix the regression in checkout; see review"'),
    exRow('repoos note 0012 "Handle the reviewer\'s suggestions before the next review"'),
    exRow('repoos update 0012 --title "New title" --area web'),
    exRow("repoos list ready"),
    exRow("repoos status", "one-screen health snapshot"),
    exRow("repoos status --json", "machine-readable, for agents/tools"),
    exRow("repoos index --json", "machine-readable, for agents/tools"),
    exRow("repoos serve", "live API + SSE at http://127.0.0.1:7171"),
  ].join("\n    ");

  console.log(`
  ${c.bold(c.cyan("RepoOS"))} ${c.dim("v" + VERSION)} — the repo is the operating system

  ${c.bold("USAGE")}
    repoos <command> [args]

  ${c.bold("COMMANDS")}
    ${commandLines}

  ${c.bold("EXAMPLES")}
    ${exampleLines}
`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  // Run every command under Bun when it's available (opt out with
  // REPOOS_RUNTIME=node). With `execve` this call replaces the process image;
  // with the spawn fallback the Node parent stays only to relay signals. Done
  // first, so nothing (prompts, the staleness warning) runs twice.
  if (reexecUnderBunIfRequested()) {
    return;
  }

  // Name the managed project in `ps`/Activity Monitor for the long-lived serve
  // process (#0347). Done here — before the staleness check — so the one-time
  // Bun re-exec inside setServeProcessTitle can't re-print that warning, and
  // only for the real `serve` command (cmdServe is also called mid-`init`,
  // where a re-exec would restart the whole guided flow). Display-only.
  if (cmd === "serve" || cmd === "server") setServeProcessTitle(serveProcessTitle());

  // Staleness check — skip for version/help since those read no source, and
  // for `status`/`check` which report staleness themselves as first-class
  // output (a second, louder warning above their own would be noise).
  const skipCheck = new Set([
    "version",
    "--version",
    "-v",
    undefined,
    "check",
    "status",
    "help",
    "--help",
    "-h",
    "upgrade",
    "uninstall",
  ]);
  if (!skipCheck.has(cmd)) {
    const result = checkBuild();
    // Only warn when the RepoOS build contract actually applies (marker
    // present). No dist/ or no marker means this checkout isn't using our build
    // pipeline — see checkBuildForRoot's `applicable` (#0349).
    if (result.stale && result.applicable) {
      const config = loadConfig();
      const strict =
        config.strictBuild ||
        process.env.REPOOS_STRICT_BUILD === "1" ||
        process.argv.includes("--strict-build");
      if (strict) {
        console.error(c.red("  ✗ ") + result.message);
        process.exit(1);
      }
      console.error(c.yellow("  ⚠ ") + result.message);
    }
  }

  switch (cmd) {
    case "init":
      void cmdInit(rest);
      break;
    case "list":
    case "ls":
      cmdList(rest[0]);
      break;
    case "status":
      void cmdStatus(rest);
      break;
    case "show":
    case "cat":
      cmdShow(rest[0]);
      break;
    case "mv":
    case "move": {
      let note: string | undefined;
      const args = rest.slice();
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--note") note = args[++i];
      }
      cmdMv(args[0], args[1], note);
      break;
    }
    case "note":
      cmdNote(rest);
      break;
    case "update":
      cmdUpdate(rest);
      break;
    case "new":
    case "add":
      cmdNew(rest);
      break;
    case "new-doc":
      void cmdNewDoc(rest);
      break;
    case "index":
    case "reindex":
      cmdIndex(rest);
      break;
    case "gc":
      cmdGc(rest);
      break;
    case "serve":
    case "server":
      void cmdServe(rest);
      break;
    case "stop":
      cmdStop(rest);
      break;
    case "check":
      void cmdCheck();
      break;
    case "tunnel":
      void cmdTunnel(rest);
      break;
    case "upgrade":
      void cmdUpgrade(rest);
      break;
    case "uninstall":
      void cmdUninstall(rest);
      break;
    case "version":
    case "--version":
    case "-v":
      console.log("repoos v" + VERSION);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      help();
      break;
    default:
      console.error(c.red(`  Unknown command: ${cmd}`));
      help();
      process.exitCode = 1;
  }
}

main();
