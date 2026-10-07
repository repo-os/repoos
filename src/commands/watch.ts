/**
 * `repoos watch` — stream board events over SSE (#0728).
 */
import { c } from "../cli/colors.js";
import { consumeSseResponse, parseSseChunk } from "../cli/sse-client.js";
import { RepoOsApi, RepoOsApiError } from "../cli/repoos-api.js";
import type { RepoEvent } from "../server/live-index.js";
import {
  matchesBoardWatchFilter,
  projectBoardWatchEvent,
  type BoardWatchEvent,
} from "../server/board-events.js";

export interface WatchOptions {
  json: boolean;
  taskId?: string;
  port?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function printHuman(ev: BoardWatchEvent): void {
  const who = ev.taskId ? `#${ev.taskId}` : "board";
  console.log(`${c.dim(ev.at)}  ${c.cyan(ev.type)}  ${who}  ${ev.cause}`);
}

/**
 * Reconnecting watch loop — exported for tests. Exits by throwing when the
 * server is unreachable (`RepoOsApiError` status 0).
 */
export async function runBoardWatchLoop(
  api: RepoOsApi,
  opts: WatchOptions & { shouldContinue: () => boolean; reconnectMs?: number },
  onEvent: (ev: BoardWatchEvent) => void,
): Promise<void> {
  const reconnectMs = opts.reconnectMs ?? 2000;
  while (opts.shouldContinue()) {
    try {
      const res = await api.fetchEventStream();
      if (res.status === 401) {
        const relogged = await api.reauthenticate();
        if (!relogged) throw new RepoOsApiError("Authentication required", 401);
        continue;
      }
      if (!res.ok) {
        throw new RepoOsApiError(`SSE failed: HTTP ${res.status}`, res.status);
      }
      await consumeSseResponse(
        res,
        (raw) => {
          const projected = projectBoardWatchEvent(raw as RepoEvent);
          if (!projected) return;
          if (!matchesBoardWatchFilter(projected, opts.taskId)) return;
          onEvent(projected);
        },
        opts.shouldContinue,
      );
    } catch (err) {
      if (!opts.shouldContinue()) return;
      if (err instanceof RepoOsApiError && err.status === 0) throw err;
      await sleep(reconnectMs);
    }
  }
}

export async function cmdWatch(args: string[]): Promise<number> {
  const opts: WatchOptions = { json: false };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--task") opts.taskId = args[++i]?.trim();
    else if (a === "--port") {
      const p = Number(args[++i]);
      if (!Number.isInteger(p) || p <= 0) {
        console.error(c.red("  ✗ ") + "--port requires a positive integer");
        return 1;
      }
      opts.port = p;
    } else if (a === "--help" || a === "-h") {
      console.log("Usage: repoos watch [--json] [--task <id>] [--port N]");
      return 0;
    } else rest.push(a);
  }
  if (rest.length) {
    console.error(c.red("  ✗ ") + `Unknown arguments: ${rest.join(" ")}`);
    return 1;
  }

  const api = new RepoOsApi({ port: opts.port });
  if (!(await api.health())) {
    console.error(
      c.red("  ✗ ") +
        `Can't reach the RepoOS server at ${api.base}. Start it with \`repoos serve\`.`,
    );
    return 1;
  }

  let running = true;
  const onSig = (): void => {
    running = false;
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  try {
    await runBoardWatchLoop(api, { ...opts, shouldContinue: () => running }, (ev) => {
      if (opts.json) console.log(JSON.stringify(ev));
      else printHuman(ev);
    });
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(c.red("  ✗ ") + msg);
    return 1;
  } finally {
    process.off("SIGINT", onSig);
    process.off("SIGTERM", onSig);
  }
}
