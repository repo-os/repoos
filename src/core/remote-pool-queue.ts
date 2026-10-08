import { describeCapabilities } from "./remote-hosts.js";

/** Live queue position while a job waits on {@link TailscaleHostPool} (#0706). */
export interface RemotePoolQueueInfo {
  /** How many other runs are ahead in the pool (in-flight + earlier waiters). */
  ahead: number;
  /** Host dispatch would assign next for this waiter. */
  host: string;
  /** 1-based queue position on that host (ahead + 1). */
  position: number;
}

const QUEUE_LINE_RE =
  /waiting for a runner(?: on ([^\s(]+))? \(queue position (\d+)\)[^\n]*queued behind (\d+) other remote run/;

/** Streamed to check logs / transcripts when the pool queue blocks (#0706). */
export function formatRemotePoolQueueMessage(
  info: RemotePoolQueueInfo,
  capabilities: string[] = [],
): string {
  const need = capabilities.length
    ? `waiting for a host with ${describeCapabilities(capabilities)} — `
    : "";
  const where = info.host
    ? `waiting for a runner on ${info.host} (queue position ${info.position})`
    : `waiting for a runner (queue position ${info.position} — eligible hosts recovering)`;
  return (
    `[${where} — ` +
    `queued behind ${info.ahead} other remote run(s) — ${need}` +
    "every eligible host is at its per-host limit; starts when a slot frees]\n"
  );
}

/** Parse the latest queue line from buffered check output (chip / transcript). */
export function parseRemotePoolQueueMessage(text: string): RemotePoolQueueInfo | null {
  const matches = [...text.matchAll(new RegExp(QUEUE_LINE_RE.source, "g"))];
  const last = matches.at(-1);
  if (!last) return null;
  const ahead = Number(last[3]);
  const position = Number(last[2]);
  if (!Number.isFinite(ahead) || !Number.isFinite(position)) return null;
  return { host: last[1] ?? "", position, ahead };
}
