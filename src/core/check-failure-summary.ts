/**
 * Pull the useful, human-readable diagnosis out of a Vitest failure block.
 *
 * Full check output can be large and often ends with a coloured received-vs-
 * expected diff. That diff is valuable in the expandable log, but it makes a
 * poor headline: it can begin halfway through a JSON object and hide the test
 * that actually failed. Keep the test name, source location, and error kind
 * together for compact status surfaces.
 */
export function summarizeCheckFailure(output: string): string | null {
  const lines = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let failureIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^(?:[❯×]\s*)?FAIL\s+/.test(lines[i])) {
      failureIndex = i;
      break;
    }
  }
  if (failureIndex === -1) return null;

  const heading = lines[failureIndex].replace(/^(?:[❯×]\s*)?FAIL\s+/, "");
  const block = lines.slice(failureIndex + 1);
  const location = block.find((line) =>
    /(?:^|\s)(?:[^\s:]+\/)?[^\s:]+\.(?:test|spec)\.[cm]?[jt]sx?:\d+:\d+/.test(line),
  );
  const error = block.find((line) => /^(?:[A-Za-z]*Error|Error):/.test(line));

  const parts = [heading];
  if (location) parts.push(`at ${location.replace(/^[❯×]\s*/, "")}`);
  if (error) parts.push(error);
  return parts.join(" — ");
}
