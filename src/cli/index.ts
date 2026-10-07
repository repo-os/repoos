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
  cmdRm,
  cmdUpdate,
  cmdNew,
  cmdIndex,
  cmdNote,
} from "../commands/tasks.js";
import { cmdDocs, cmdNewDoc } from "../commands/docs.js";
import { cmdGc } from "../commands/gc.js";
import { cmdOutline } from "../commands/outline.js";
import { cmdCheck } from "../commands/check.js";
import { cmdShot } from "../commands/shot.js";
import { cmdServe, serveProcessTitle, setServeProcessTitle } from "../commands/serve.js";
import { cmdStop } from "../commands/stop.js";
import { cmdTunnel } from "../commands/tunnel.js";
import { cmdUpgrade } from "../commands/upgrade.js";
import { cmdUninstall } from "../commands/uninstall.js";
import { cmdStatus } from "../commands/status.js";
import { cmdDoctor } from "../commands/doctor.js";
import { cmdCertify } from "../commands/certify.js";
import { cmdSupport } from "../commands/support.js";
import { cmdService } from "../commands/service.js";
import {
  cmdAgentsRunning,
  cmdConfig,
  cmdDone,
  cmdMessage,
  cmdOverride,
  cmdPause,
  cmdPreview,
  cmdReview,
  cmdRunners,
  cmdStart,
  cmdStats,
  cmdDecisions,
} from "../commands/control-api.js";
import { cmdWatch } from "../commands/watch.js";
import { cmdDriver } from "../commands/driver.js";
import { checkBuild } from "../core/build.js";
import { loadConfig } from "../core/config.js";
import { reexecAfterStaleBuild, reexecUnderBunIfRequested } from "../core/runtime.js";
import { c } from "./colors.js";
import { commandUsage, printCommandHelp, printHelp, SELF_HELP_COMMANDS } from "./help.js";
import { readVersion } from "../core/version.js";

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

const VERSION = readVersion();

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  // Run every command under Bun when it's available (opt out with
  // REPOOS_RUNTIME=node). With `execve` this call replaces the process image;
  // with the spawn fallback the Node parent stays only to relay signals. Done
  // first, so nothing (prompts, the staleness warning) runs twice.
  if (reexecUnderBunIfRequested()) {
    return;
  }
  if (reexecAfterStaleBuild()) {
    return;
  }

  // Name the managed project in `ps`/Activity Monitor for the long-lived serve
  // process (#0347). Done here — before the staleness check — so the one-time
  // Bun re-exec inside setServeProcessTitle can't re-print that warning, and
  // only for the real `serve` command (cmdServe is also called mid-`init`,
  // where a re-exec would restart the whole guided flow). Display-only.
  if (cmd === "serve" || cmd === "server") setServeProcessTitle(serveProcessTitle());

  // Per-command help (#0591): `repoos <cmd> --help` prints that command's full
  // usage instead of running it. Only the *first* argument counts, so a literal
  // value like `repoos mv 0012 active --note "--help"` still runs the command.
  // Commands that already implement `--help` themselves keep their own, richer
  // output; aliases (`ls`, `server`, …) resolve to their canonical entry.
  if (
    cmd &&
    (rest[0] === "--help" || rest[0] === "-h") &&
    !SELF_HELP_COMMANDS.has(cmd) &&
    commandUsage(cmd) !== null
  ) {
    printCommandHelp(cmd);
    return;
  }

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
    "doctor",
    "certify",
    "support",
    "help",
    "--help",
    "-h",
    "upgrade",
    "uninstall",
    // Read-only inspection of one file: the build-staleness hash is pure
    // overhead here, and `outline` is meant to stay well under 200ms.
    "outline",
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
    case "doctor":
      void cmdDoctor(rest);
      break;
    case "certify":
      void cmdCertify(rest);
      break;
    case "support":
      void cmdSupport(rest);
      break;
    case "show":
    case "cat":
      cmdShow(rest[0]);
      break;
    case "mv":
    case "move": {
      let note: string | undefined;
      let force = false;
      const args = rest.slice();
      for (let i = 0; i < args.length; i++) {
        if (args[i] === "--note") note = args[++i];
        else if (args[i] === "--force-not-merged") force = true;
      }
      cmdMv(args[0], args[1], note, { force });
      break;
    }
    case "note":
      cmdNote(rest);
      break;
    case "rm":
    case "delete":
      cmdRm(rest);
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
    case "docs":
      void cmdDocs(rest);
      break;
    case "index":
    case "reindex":
      cmdIndex(rest);
      break;
    case "gc":
      cmdGc(rest);
      break;
    case "outline":
      cmdOutline(rest);
      break;
    case "serve":
    case "server":
      void cmdServe(rest);
      break;
    case "stop":
      cmdStop(rest);
      break;
    case "service":
      void cmdService(rest);
      break;
    case "check":
      void cmdCheck(rest);
      break;
    case "start":
      void cmdStart(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "pause":
      void cmdPause(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "message":
      void cmdMessage(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "review":
      void cmdReview(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "done":
      void cmdDone(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "override":
      void cmdOverride(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "preview":
      void cmdPreview(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "config":
      void cmdConfig(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "runners":
      void cmdRunners(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "agents":
      void cmdAgentsRunning(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "stats":
      void cmdStats(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "decisions":
    case "attention":
      void cmdDecisions(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "watch":
      void cmdWatch(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "driver":
      void cmdDriver(rest).then((code) => {
        if (code !== 0) process.exitCode = code;
      });
      break;
    case "shot":
      void cmdShot(rest)
        .then((code) => {
          if (code !== 0) process.exitCode = code;
        })
        .catch((err: unknown) => {
          console.error(c.red(`  ✗ shot failed: ${(err as Error).message}`));
          process.exitCode = 1;
        });
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
      printHelp();
      break;
    default:
      console.error(c.red(`  Unknown command: ${cmd}`));
      printHelp();
      process.exitCode = 1;
  }
}

main();
