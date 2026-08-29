/**
 * `repoos serve` — start the local RepoOS server: in-memory live index, file
 * watcher, JSON API, and SSE event stream. Stays running until interrupted.
 */
import { startServer } from "../server/server.js";
import { PREVIEW_REQUEST_SIGNAL } from "../server/agents.js";
import { isBun } from "../core/runtime.js";
import { c, statusColor } from "../cli/colors.js";
import type { RepoEvent } from "../server/live-index.js";
import { detectTailscaleIPv4 } from "../core/tailscale.js";

/**
 * Picks the bind host: an explicit `--host` always wins; otherwise, if
 * Tailscale is running on this machine, default to 0.0.0.0 (all interfaces)
 * so the server is reachable both from other Tailscale devices AND from
 * localhost — binding to the Tailscale IP alone would leave nothing
 * listening on 127.0.0.1, silently breaking anything on this same machine
 * that assumes localhost reachability (Cloudflare Tunnel's local origin,
 * RepoOS's own tunnel readiness check, etc.). Falls back to localhost-only
 * when Tailscale isn't detected. `tailscaleIP` is surfaced separately (even
 * though the actual bind is 0.0.0.0) so callers can show the address other
 * tailnet devices should actually use.
 */
export function resolveServeHost(explicitHost?: string): {
  host: string;
  tailscaleDetected: boolean;
  tailscaleIP?: string;
} {
  if (explicitHost) return { host: explicitHost, tailscaleDetected: false };
  const tailscaleIP = detectTailscaleIPv4();
  if (tailscaleIP) return { host: "0.0.0.0", tailscaleDetected: true, tailscaleIP };
  return { host: "127.0.0.1", tailscaleDetected: false };
}

/**
 * True when this process is a managed agent (REPOOS_AGENT=1) attempting to
 * launch `repoos serve` directly, as opposed to a preview child or a reload
 * replacement spawned by the main server. The AgentRunner sets REPOOS_AGENT=1
 * on every agent spawn; the preview/reload markers are exempt so RepoOS-owned
 * processes keep working. Exported for the defense-in-depth tests (#0096).
 */
export function directServeBlockedByAgent(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.REPOOS_AGENT === "1" && env.REPOOS_PREVIEW_CHILD !== "1" && env.REPOOS_RELOAD !== "1";
}

export async function cmdServe(
  args: string[],
  opts: { onShutdown?: () => void } = {},
): Promise<void> {
  // Defense in depth (#0096): a managed agent process must never start its own
  // `repoos serve`. An agent that ignores the mission and runs `repoos serve`
  // directly is rejected here BEFORE binding, so it can never grab the main
  // server port.
  if (directServeBlockedByAgent()) {
    console.error(c.red("  ✗ Managed agent processes may not launch `repoos serve`."));
    console.error(
      c.dim(
        "    RepoOS owns previews and the control-plane port. Request a managed preview instead:",
      ),
    );
    console.error(
      c.dim(`      include this exact line in your response: ${PREVIEW_REQUEST_SIGNAL}`),
    );
    console.error(
      c.dim(
        "    RepoOS starts the preview from your worktree, probes it server-side, and records the URL + result in your transcript.",
      ),
    );
    process.exitCode = 1;
    return;
  }

  let port = 7171;
  let explicitHost: string | undefined;
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") port = Number(args[++i]);
    else if (args[i] === "--host") explicitHost = args[++i];
    else if (args[i] === "--quiet" || args[i] === "-q") quiet = true;
  }
  const { host, tailscaleDetected, tailscaleIP } = resolveServeHost(explicitHost);

  let handle;
  try {
    // REPOOS_RELOAD=1 marks a replacement spawned by the auto-reload manager:
    // it retries EADDRINUSE until the old process hands the port over.
    handle = await startServer({
      port,
      host,
      reloadReplacement: process.env.REPOOS_RELOAD === "1",
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("EADDRINUSE")) {
      console.error(
        c.red(`  Port ${port} is in use.`) + c.dim(` Try: repoos serve --port ${port + 1}`),
      );
    } else {
      console.error(c.red("  Failed to start server: " + msg));
    }
    process.exitCode = 1;
    return;
  }

  const snap = handle.index.snapshot();
  console.log(c.bold(c.cyan("\n  RepoOS server")) + c.dim("  ·  ") + c.bold(handle.url));
  console.log(c.dim("  open ") + c.cyan(handle.url) + c.dim(" in your browser for the UI"));
  console.log(
    c.dim("  watching ") +
      snap.taskCount +
      c.dim(" tasks  ·  SSE stream at ") +
      c.cyan(handle.url + "/api/events"),
  );
  const rt = isBun()
    ? `Bun ${(process.versions as { bun?: string }).bun ?? ""}`.trim()
    : `Node ${process.versions.node}`;
  console.log(c.dim("  runtime ") + rt);
  console.log(
    c.dim("  api: ") + c.dim("/api/tasks  /api/tasks/:id  /api/counts  /api/index  /api/docs"),
  );
  if (tailscaleDetected) {
    console.log(
      c.dim("  Tailscale detected — listening on all interfaces (") +
        c.cyan("0.0.0.0") +
        c.dim("), reachable from other Tailscale devices at ") +
        c.cyan(`http://${tailscaleIP}:${handle.port}`) +
        c.dim(". Use ") +
        c.cyan("--host 127.0.0.1") +
        c.dim(" to restrict to localhost only."),
    );
  }
  console.log(c.dim("  press ^C to stop\n"));

  // Live activity log in the terminal, mirroring the SSE stream.
  if (!quiet) {
    handle.index.on((e: RepoEvent) => {
      const t = new Date().toTimeString().slice(0, 8);
      const stamp = c.dim(t + "  ");
      if (e.type === "task.created")
        console.log(stamp + c.green("created ") + c.dim("#" + e.task.id) + " " + e.task.title);
      else if (e.type === "task.updated") {
        const changed = Object.keys(e.prev).join(", ");
        const statusBit =
          e.prev.status !== undefined ? " → " + statusColor(e.task.status)(e.task.status) : "";
        console.log(
          stamp +
            c.cyan("updated ") +
            c.dim("#" + e.task.id) +
            statusBit +
            c.dim("  (" + changed + ")"),
        );
      } else if (e.type === "task.deleted")
        console.log(stamp + c.red("deleted ") + c.dim("#" + e.id));
    });
  }

  let shuttingDown = false;
  const shutdown = async (signal: "SIGINT" | "SIGTERM") => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      c.dim(`\n  shutting down after ${signal} (pid ${process.pid}, port ${handle.port})…`),
    );
    await handle.close(`received ${signal}`);
    opts.onShutdown?.();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}
