/**
 * `repoos service <subcommand>` — manage background services for this repo.
 *
 *   repoos service list          List all managed services
 *   repoos service status        Show this repo's service status
 *   repoos service start         Start this repo's background service
 *   repoos service stop          Stop this repo's background service
 *   repoos service restart       Restart this repo's background service
 *   repoos service enable        Enable auto-start at login
 *   repoos service disable       Disable auto-start at login
 *   repoos service install       Install a background service for this repo
 *   repoos service remove        Remove this repo's background service
 *
 * Without a subcommand, shows this repo's service status.
 * Commands operate on the current repo by default.
 */
import {
  listServices,
  getServiceStatus,
  installService,
  removeService,
  startService,
  stopService,
  restartService,
  enableAutoStart,
  disableAutoStart,
  checkHealth,
  type ServiceListEntry,
} from "../core/service-manager.js";
import { boardRoot, loadConfig, resolveServePort } from "../core/config.js";
import { c } from "../cli/colors.js";

function statusLabel(s: string): string {
  if (s === "running") return c.green("running");
  if (s === "stopped") return c.dim("stopped");
  if (s === "disabled") return c.dim("disabled");
  if (s === "error") return c.red("error");
  return c.yellow("unknown");
}

function printService(s: ServiceListEntry): void {
  console.log(
    `  ${c.cyan(s.id)}  ${statusLabel(s.status)}  ${c.dim("port")} ${s.port}  ${c.dim("auto-start")} ${s.autoStart ? "yes" : "no"}`,
  );
  console.log(`    ${c.dim("path")} ${s.root}`);
  console.log(`    ${c.dim("platform")} ${s.platform}  ${c.dim("label")} ${s.label}`);
  if (s.lastHealthCheck) {
    console.log(
      `    ${c.dim("health")} ${s.lastHealthCheck}${s.healthError ? `  ${c.red(s.healthError)}` : ""}`,
    );
  }
}

export async function cmdService(argv: string[]): Promise<void> {
  const sub = argv[0];

  switch (sub) {
    case "list":
    case "ls": {
      const { services, lingerEnabled } = listServices();
      if (services.length === 0) {
        console.log(c.dim("  No managed background services."));
        console.log(c.dim("  Use ") + c.cyan("repoos service install") + c.dim(" to set one up."));
        return;
      }
      console.log(c.bold("  Managed background services:\n"));
      for (const s of services) {
        printService(s);
        console.log();
      }
      // Linux linger guidance — surface when services exist but linger is off
      if (lingerEnabled === false && services.some((s) => s.platform === "systemd")) {
        console.log(
          c.yellow("  ⚠") +
            c.dim(" Systemd user services stop on logout unless lingering is enabled."),
        );
        console.log(
          c.dim("    Enable with: ") +
            c.cyan("loginctl enable-linger " + (process.env.USER ?? "")) +
            c.dim(" (survives reboot and terminal close)"),
        );
        console.log();
      }
      return;
    }

    case "status": {
      const { root } = boardRoot();
      const entry = await getServiceStatus(root);
      if (!entry) {
        console.log(c.dim("  No background service installed for this repo."));
        console.log(c.dim("  Use ") + c.cyan("repoos service install") + c.dim(" to set one up."));
        return;
      }
      console.log(c.bold("  Service status:\n"));
      printService(entry);
      return;
    }

    case "install": {
      const { root } = boardRoot();
      const config = loadConfig(root);
      const port = resolveServePort(root, config);
      const result = await installService(root, port, { autoStart: false });
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service installed."));
      console.log(c.dim(`    id: ${result.entry!.id}`));
      console.log(c.dim(`    port: ${result.entry!.port}`));
      console.log(c.dim(`    platform: ${result.entry!.platform}`));
      console.log(
        c.dim("  Start it with ") +
          c.cyan("repoos service start") +
          c.dim(" or ") +
          c.cyan("repoos serve"),
      );
      return;
    }

    case "start": {
      const { root } = boardRoot();
      const result = await startService(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service started."));
      return;
    }

    case "stop": {
      const { root } = boardRoot();
      const result = await stopService(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service stopped."));
      return;
    }

    case "restart": {
      const { root } = boardRoot();
      const result = await restartService(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service restarted."));
      return;
    }

    case "enable": {
      const { root } = boardRoot();
      const result = await enableAutoStart(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Auto-start enabled."));
      return;
    }

    case "disable": {
      const { root } = boardRoot();
      const result = await disableAutoStart(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Auto-start disabled."));
      return;
    }

    case "remove":
    case "uninstall": {
      const { root } = boardRoot();
      const result = await removeService(root);
      if (!result.ok) {
        console.error(c.red("  ✗ " + result.error));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service removed."));
      return;
    }

    case "health": {
      const { root } = boardRoot();
      const result = await checkHealth(root);
      if (!result.ok) {
        console.error(c.red(`  ✗ Health check failed: ${result.error ?? "unknown"}`));
        process.exitCode = 1;
        return;
      }
      console.log(c.green("  ✓ Service is healthy."));
      return;
    }

    default: {
      // No subcommand or unknown — show status
      const { root } = boardRoot();
      const entry = await getServiceStatus(root);
      if (!entry) {
        console.log(c.dim("  No background service installed for this repo."));
        console.log(c.dim("  Available commands:"));
        console.log(
          c.cyan("    repoos service install") + c.dim("   Install a background service"),
        );
        console.log(c.cyan("    repoos service list") + c.dim("      List all managed services"));
        console.log(c.cyan("    repoos service start") + c.dim("     Start the service"));
        console.log(c.cyan("    repoos service stop") + c.dim("      Stop the service"));
        console.log(c.cyan("    repoos service restart") + c.dim("   Restart the service"));
        console.log(c.cyan("    repoos service enable") + c.dim("    Enable auto-start at login"));
        console.log(c.cyan("    repoos service disable") + c.dim("   Disable auto-start at login"));
        console.log(c.cyan("    repoos service remove") + c.dim("    Remove the service"));
        return;
      }
      console.log(c.bold("  Service status:\n"));
      printService(entry);
      return;
    }
  }
}
