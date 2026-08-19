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
} from "../commands/tasks.js";
import { cmdNewDoc } from "../commands/docs.js";
import { cmdCheck } from "../commands/check.js";
import { cmdServe } from "../commands/serve.js";
import { cmdTunnel } from "../commands/tunnel.js";
import { checkBuild } from "../core/build.js";
import { loadConfig } from "../core/config.js";
import { c } from "./colors.js";

const VERSION = "0.1.0";

function help(): void {
  console.log(`
  ${c.bold(c.cyan("RepoOS"))} ${c.dim("v" + VERSION)} — the repo is the operating system

  ${c.bold("USAGE")}
    repoos <command> [args]

  ${c.bold("COMMANDS")}
    ${c.cyan("check")}               Full definition-of-done: build, typecheck, tests, UI smoke check
    ${c.cyan("init")} [name]           Scaffold work/, repoos.toml, AGENTS.md; outside a git repo runs a guided flow that can launch the web console
    ${c.cyan("list")} [status]        Show the board (or one column: ${c.dim("inbox|ready|active|review|done")})
    ${c.cyan("show")} <id>            Show a task's full spec
    ${c.cyan("mv")} <id> <status>     Move a task to a new status (edits frontmatter)
    ${c.cyan("update")} <id>           Edit a task's metadata/body   ${c.dim('flags: --title --area --priority --type --body --branch --assigned-to')}
    ${c.cyan("new")} "<title>"        Create a task   ${c.dim('flags: --ai --type --area --priority')}
    ${c.cyan("new-doc")} "<desc>"     Create a document from a description via PM agent
    ${c.cyan("index")} [--json]       Rebuild the derived index cache
    ${c.cyan("serve")} [--port N]     Start the local server (live API + SSE stream)
    ${c.cyan("tunnel")} <sub>         Publish local apps via Cloudflare Tunnel + Zero Trust ${c.dim("(setup|create|allow|deny|start|install|stop|list|status)")}

  ${c.bold("EXAMPLES")}
    ${c.dim("$")} repoos init
    ${c.dim("$")} repoos init myproject   # guided new-project flow outside a git repo
    ${c.dim("$")} repoos new "Add company dashboard" --ai --type feature --area web --priority p1
    ${c.dim("$")} repoos new-doc "API design doc for the payment system"
    ${c.dim("$")} repoos mv 0012 active
    ${c.dim("$")} repoos update 0012 --title "New title" --area web
    ${c.dim("$")} repoos list ready
    ${c.dim("$")} repoos index --json   ${c.dim("# machine-readable, for agents/tools")}
    ${c.dim("$")} repoos serve          ${c.dim("# live API + SSE at http://127.0.0.1:7171")}
`);
}

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  // Staleness check — skip for version/help since those read no source.
  const skipCheck = new Set(["version", "--version", "-v", undefined, "check", "help", "--help", "-h"]);
  if (!skipCheck.has(cmd)) {
    const result = checkBuild();
    if (result.stale) {
      const config = loadConfig();
      const strict = config.strictBuild || process.env.REPOOS_STRICT_BUILD === "1" || process.argv.includes("--strict-build");
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
    case "show":
    case "cat":
      cmdShow(rest[0]);
      break;
    case "mv":
    case "move":
      cmdMv(rest[0], rest[1]);
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
    case "serve":
    case "server":
      void cmdServe(rest);
      break;
    case "check":
      void cmdCheck();
      break;
    case "tunnel":
      void cmdTunnel(rest);
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
