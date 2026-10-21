/**
 * argv sanitizing for agent CLI launches (#0889).
 *
 * A NUL byte cannot cross a process boundary: Node's `spawn` throws
 * `The argument 'args[N]' must be a string without null bytes` before the CLI
 * ever starts. Prompt text is assembled from arbitrary sources — a task body, a
 * queued message, a log line, a crash detail, a path — and agent output is not
 * guaranteed to be text. #0877's crash detail was a degenerate-output excerpt
 * made almost entirely of NULs; crash recovery pasted it into the resume
 * instruction, so every automatic relaunch failed while a manual start worked.
 *
 * Strip NULs at the spawn boundary for every agent CLI, whichever path built
 * the prompt (start, resume, recovery, message delivery, one-shot). They carry
 * no meaning in a prompt and cannot survive argv anyway.
 */
const NUL = "\u0000";

/** Remove NUL bytes from text bound for a process argument. */
export function stripNulBytes(text: string): string {
  return text.includes(NUL) ? text.replaceAll(NUL, "") : text;
}

export interface SanitizedSpawnArgs {
  args: string[];
  /** NUL bytes removed across all arguments; zero means the command is unchanged. */
  removed: number;
}

/** Sanitize every argument of an argv, reporting how many NULs were removed. */
export function sanitizeSpawnArgs(args: readonly string[]): SanitizedSpawnArgs {
  let removed = 0;
  const sanitized = args.map((arg) => {
    if (!arg.includes(NUL)) return arg;
    removed += arg.split(NUL).length - 1;
    return arg.replaceAll(NUL, "");
  });
  return { args: sanitized, removed };
}
