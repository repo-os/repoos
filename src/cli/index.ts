#!/usr/bin/env node
/**
 * RepoOS CLI entrypoint. Bin name: `ros`.
 * Dependency-free arg routing — no commander/yargs needed for Stage 1.
 */
import { cmdInit } from "../commands/init.js";
import {
  cmdList,
  cmdShow,
  cmdMv,
  cmdNew,
  cmdIndex,
} from "../commands/tasks.js";
import { cmdServe } from "../commands/serve.js";
import { c } from "./colors.js";

const VERSION = "0.1.0";

function help(): void {
  console.log(`
  ${c.bold(c.cyan("RepoOS"))} ${c.dim("v" + VERSION)} — the repo is the operating system

  ${c.bold("USAGE")}
    ros <command> [args]

  ${c.bold("COMMANDS")}
    ${c.cyan("init")}                 Scaffold work/, repoos.toml, AGENTS.md in this repo
    ${c.cyan("list")} [status]        Show the board (or one column: ${c.dim("inbox|ready|active|review|done")})
    ${c.cyan("show")} <id>            Show a task's full spec
    ${c.cyan("mv")} <id> <status>     Move a task to a new status (edits frontmatter)
    ${c.cyan("new")} "<title>"        Create a task   ${c.dim('flags: --ai --type --area --priority')}
    ${c.cyan("index")} [--json]       Rebuild the derived index cache
    ${c.cyan("serve")} [--port N]     Start the local server (live API + SSE stream)

  ${c.bold("EXAMPLES")}
    ${c.dim("$")} ros init
    ${c.dim("$")} ros new "Add company dashboard" --ai --type feature --area web --priority p1
    ${c.dim("$")} ros mv 0012 active
    ${c.dim("$")} ros list ready
    ${c.dim("$")} ros index --json   ${c.dim("# machine-readable, for agents/tools")}
    ${c.dim("$")} ros serve          ${c.dim("# live API + SSE at http://127.0.0.1:7171")}
`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "init":
      cmdInit();
      break;
    case "list":
    case "ls":
      cmdList(rest[0]);
      break;
    case "show":
    case "cat":
      cmdShow(rest[0]);
      break;
    case "mv":
    case "move":
      cmdMv(rest[0], rest[1]);
      break;
    case "new":
    case "add":
      cmdNew(rest);
      break;
    case "index":
    case "reindex":
      cmdIndex(rest);
      break;
    case "serve":
    case "server":
      void cmdServe(rest);
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
