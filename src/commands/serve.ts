/**
 * `repoos serve` — start the local RepoOS server: in-memory live index, file
 * watcher, JSON API, and SSE event stream. Stays running until interrupted.
 */
import { startServer } from "../server/server.js";
import { c, statusColor } from "../cli/colors.js";
import type { RepoEvent } from "../server/live-index.js";

export async function cmdServe(args: string[]): Promise<void> {
  let port = 7171;
  let host = "127.0.0.1";
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" || args[i] === "-p") port = Number(args[++i]);
    else if (args[i] === "--host") host = args[++i];
    else if (args[i] === "--quiet" || args[i] === "-q") quiet = true;
  }

  let handle;
  try {
    handle = await startServer({ port, host });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("EADDRINUSE")) {
      console.error(
        c.red(`  Port ${port} is in use.`) +
          c.dim(` Try: repoos serve --port ${port + 1}`),
      );
    } else {
      console.error(c.red("  Failed to start server: " + msg));
    }
    process.exitCode = 1;
    return;
  }

  const snap = handle.index.snapshot();
  console.log(
    c.bold(c.cyan("\n  RepoOS server")) +
      c.dim("  ·  ") +
      c.bold(handle.url),
  );
  console.log(
    c.dim("  open ") + c.cyan(handle.url) + c.dim(" in your browser for the UI"),
  );
  console.log(
    c.dim("  watching ") +
      snap.taskCount +
      c.dim(" tasks  ·  SSE stream at ") +
      c.cyan(handle.url + "/api/events"),
  );
  console.log(
    c.dim("  api: ") +
      c.dim("/api/tasks  /api/tasks/:id  /api/counts  /api/index  /api/docs"),
  );
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
          e.prev.status !== undefined
            ? " → " + statusColor(e.task.status)(e.task.status)
            : "";
        console.log(
          stamp + c.cyan("updated ") + c.dim("#" + e.task.id) +
            statusBit + c.dim("  (" + changed + ")"),
        );
      } else if (e.type === "task.deleted")
        console.log(stamp + c.red("deleted ") + c.dim("#" + e.id));
    });
  }

  const shutdown = async () => {
    console.log(c.dim("\n  shutting down…"));
    await handle.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
