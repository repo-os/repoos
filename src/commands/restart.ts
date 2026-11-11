/**
 * `repoos restart [--port N]` — restart this repo's control-plane server,
 * whether it runs as a managed service, a hand-run `repoos serve`, or an
 * externally supervised process (launchd KeepAlive, systemd, …).
 */
import { boardRoot } from "../core/config.js";
import { restartRepoServer, type RestartPath } from "../core/server-restart.js";
import { c } from "../cli/colors.js";

const PATH_LABEL: Record<RestartPath, string> = {
  "managed-service": "managed service (`repoos service`)",
  "external-supervisor": "externally supervised process (supervisor respawn)",
  "hand-run": "hand-run `repoos serve` (stop + start)",
};

export async function cmdRestart(argv: string[]): Promise<void> {
  let portFilter: number | undefined;
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
