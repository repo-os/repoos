/**
 * `repoos stop [--port N]` — stop THIS repo's running `repoos serve`
 * process(es), by the PID recorded in its own `.repoos/serve-<port>.lock`.
 *
 * Replaces the machine-wide `pkill -f "dist/cli/index.js serve"` that also
 * killed every other repo's server (and any preview) — a `repoos init` repo
 * runs the same linked CLI, so the pattern is not repo-scoped.
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { boardRoot } from "../core/config.js";
import { createRepoOS } from "../core/repoos.js";
import { c } from "../cli/colors.js";

interface ServeLock {
  pid?: number;
  port?: number;
}

export function cmdStop(argv: string[]): void {
  let portFilter: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" || argv[i] === "-p") portFilter = Number(argv[++i]);
  }

  const { root } = boardRoot();
  const { config } = createRepoOS(root);
  const lockDir = join(root, config.cacheDir);

  let files: string[];
  try {
    files = readdirSync(lockDir).filter((f) => /^serve(?:-\d+)?\.lock$/.test(f));
  } catch {
    files = [];
  }
  if (portFilter) files = files.filter((f) => f === `serve-${portFilter}.lock`);

  let stopped = 0;
  for (const file of files) {
    const path = join(lockDir, file);
    let info: ServeLock | null = null;
    try {
      info = JSON.parse(readFileSync(path, "utf8")) as ServeLock;
    } catch {
      rmSync(path, { force: true });
      continue;
    }
    const pid = info?.pid;
    if (typeof pid === "number" && pid > 0 && pid !== process.pid) {
      try {
        process.kill(pid, 0); // existence probe — throws when gone
        process.kill(pid, "SIGTERM");
        stopped++;
        console.log(c.dim(`  stopped repoos serve (pid ${pid}, port ${info.port ?? "?"})`));
      } catch {
        /* already exited */
      }
    }
    rmSync(path, { force: true });
  }

  if (stopped === 0) console.log(c.dim("  no running repoos serve for this repo"));
}
