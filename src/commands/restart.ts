/**
 * `repoos restart [--port N]` — restart this repo's control-plane server,
 * whether it runs as a managed service, a hand-run `repoos serve`, or an
 * externally supervised process (launchd KeepAlive, systemd, …).
 */
import { boardRoot } from "../core/config.js";
import { restartRepoServer, type RestartPath } from "../core/server-restart.js";
import { c } from "../cli/colors.js";
import { locateRepoServer } from "../core/server-locate.js";

const PATH_LABEL: Record<RestartPath, string> = {
  "managed-service": "managed service (`repoos service`)",
  "external-supervisor": "externally supervised process (supervisor respawn)",
  "hand-run": "hand-run `repoos serve` (stop + start)",
};

export async function cmdRestart(argv: string[]): Promise<void> {
  let portFilter: number | undefined;
  const whenIdle = argv.includes("--when-idle");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--port" || argv[i] === "-p") {
      const raw = argv[++i];
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        console.error(c.red(`  ✗ Invalid --port value: ${raw ?? "(missing)"}`));
        process.exitCode = 1;
        return;
      }
      portFilter = n;
    }
  }

  const { root } = boardRoot();
  if (whenIdle) {
    const server = await locateRepoServer(root, { portFilter });
    if (!server) {
      console.error(c.red("  ✗ No running RepoOS server found to wait on."));
      process.exitCode = 1;
      return;
    }
    console.log(c.dim("  Waiting for agents, reviews and checks to finish…"));
    const host = server.host === "0.0.0.0" ? "127.0.0.1" : server.host;
    for (;;) {
      try {
        const response = await fetch(`http://${host}:${server.port}/api/update-status`);
        if (!response.ok) throw new Error(`server returned HTTP ${response.status}`);
        const status = (await response.json()) as {
          activeWork?: { agents?: number; checks?: number };
        };
        if (
          typeof status.activeWork?.agents !== "number" ||
          typeof status.activeWork?.checks !== "number"
        )
          throw new Error("server returned an invalid update status");
        if ((status.activeWork?.agents ?? 0) === 0 && (status.activeWork?.checks ?? 0) === 0) break;
      } catch (error) {
        console.error(
          c.red(`  ✗ Could not confirm the server is idle: ${(error as Error).message}`),
        );
        process.exitCode = 1;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  const result = await restartRepoServer(root, {
    portFilter,
    onBeforeStop: ({ cancelled }) => {
      // A stop is a real shutdown, not the UI's reload handover. Be specific
      // about what it interrupts rather than a blanket warning: reviews are
      // killed and re-spawned by recovery, previews/dev targets stop and are
      // restarted on demand, and engineer/PM children are durable and re-adopted.
      const killed: string[] = [];
      const resumed: string[] = [];
      if (cancelled.reviews > 0) killed.push(`${cancelled.reviews} in-flight review(s)`);
      if (cancelled.previews > 0) killed.push(`${cancelled.previews} preview(s)`);
      if (cancelled.engineers > 0) resumed.push(`${cancelled.engineers} engineer agent(s)`);
      if (cancelled.freeformRuns > 0) resumed.push(`${cancelled.freeformRuns} PM run(s)`);
      if (cancelled.devTargets > 0) resumed.push(`${cancelled.devTargets} dev target(s)`);
      if (killed.length > 0) {
        console.log(
          c.yellow(
            `  ⚠ Restarting stops ${killed.join(" and ")} — reviews are re-spawned by recovery, previews restart on demand.`,
          ),
        );
      }
      if (resumed.length > 0) {
        console.log(
          c.yellow(
            `  ⚠ ${resumed.join(", ")} will be interrupted briefly (durable; the new server re-adopts them).`,
          ),
        );
      }
      if (killed.length === 0 && resumed.length === 0) {
        console.log(
          c.dim("  ⚠ Restarting with no in-flight reviews, previews, agents or dev targets."),
        );
      }
    },
  });

  if (!result.ok) {
    console.error(c.red(`  ✗ ${result.message ?? "Restart failed"}`));
    if (result.manualCommand) {
      console.log(c.dim("    try manually:"));
      console.log(c.cyan(`    ${result.manualCommand}`));
    }
    process.exitCode = 1;
    return;
  }

  if (result.path) {
    console.log(c.dim(`  path: ${PATH_LABEL[result.path]}`));
  }
  const fromV = result.oldVersion ? `v${result.oldVersion}` : "unknown version";
  const toV = result.newVersion ? `v${result.newVersion}` : "unknown version";
  console.log(
    c.green("  ✓ Server restarted.") +
      c.dim(`  pid ${result.oldPid ?? "?"} → ${result.newPid ?? "?"}  ${fromV} → ${toV}`),
  );
}
