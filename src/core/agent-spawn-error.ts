/** Turn a missing agent executable into an actionable task failure. */
export function agentSpawnErrorMessage(
  command: string,
  error: NodeJS.ErrnoException,
  path = process.env.PATH ?? "",
): string | undefined {
  if (error.code !== "ENOENT") return undefined;
  return `Agent CLI \`${command}\` was not found (spawn ENOENT). PATH searched: ${path || "(empty)"}`;
}
