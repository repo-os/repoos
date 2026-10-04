/**
 * Guarded child-process stdin writes (#0646).
 *
 * A child that exits before draining its stdin — an `ssh` to a remote
 * validation host that drops or times out, a CLI app-server that dies during
 * startup — makes the next write to that pipe fail with
 * `EPIPE: broken pipe, write`. That error is emitted on the child's *stdin
 * stream* (`child.stdin`), which is separate from the child's own `error`
 * event, so a caller that only listens for `child.on("error")` gets no
 * notification: the stdin error is an uncaught exception. RepoOS's
 * process-level fatal handler used to exit the whole control plane for it,
 * leaving the serve lock behind and nothing to restart it (#0646).
 *
 * Every stdin write in this codebase goes through {@link writeChildStdin}, so
 * the `error` listener is attached *before* the write and an EPIPE resolves
 * the caller's promise as a failed/empty result instead of throwing,
 * logged with the command name.
 *
 * The rule: never call `child.stdin.write()` / `child.stdin.end()` directly.
 */
import type { ChildProcess } from "node:child_process";

export interface WriteChildStdinOptions {
  /** Command label for the warning log (e.g. `"ssh"`, `"codex app-server"`). */
  command: string;
  /** `true` closes stdin after the write (`end`); `false` keeps it open (`write`). */
  end?: boolean;
  /** Called once when the stdin stream errors, after it has been logged. */
  onError?: (err: NodeJS.ErrnoException) => void;
  /** Override the default `console.warn` sink (tests, a server logger, …). */
  log?: (message: string, err: NodeJS.ErrnoException) => void;
}

const defaultLog = (message: string, err: NodeJS.ErrnoException): void => {
  console.warn(`[repoos] ${message}: ${err.message}`);
};

/**
 * Attach an `error` listener to `child.stdin`, then write `data` (or `end` it)
 * so an EPIPE is reported through `onError` instead of becoming an uncaught
 * exception. A missing or already-destroyed stdin is a no-op.
 */
export function writeChildStdin(
  child: Pick<ChildProcess, "stdin">,
  data: string | Buffer,
  opts: WriteChildStdinOptions,
): void {
  const stdin = child.stdin;
  if (!stdin || stdin.destroyed) return;
  let reported = false;
  stdin.on("error", (raw) => {
    if (reported) return;
    reported = true;
    const err = raw as NodeJS.ErrnoException;
    (opts.log ?? defaultLog)(`child stdin write to ${opts.command} failed`, err);
    opts.onError?.(err);
  });
  if (opts.end) stdin.end(data);
  else stdin.write(data);
}
