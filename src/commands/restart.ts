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
    onBeforeStop: ({ activeEngineers }) => {
      if (activeEngineers > 0) {
        console.log(
          c.yellow(
            `  ⚠ ${activeEngineers} engineer agent(s) are running — restarting will interrupt them briefly; in-flight work may be adopted after the new server starts (#0214).`,
          ),
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
