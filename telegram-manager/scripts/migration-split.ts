/** Splits a migration file at a line that is exactly `-- rollback` (not a
 * mention of that phrase in a header comment). */
export function splitRollback(sql: string): { forward: string; rollback: string } {
  const match = sql.match(/^-- rollback$/m);
  if (!match || match.index === undefined) return { forward: sql, rollback: "" };
  const idx = match.index;
  const forward = sql.slice(0, idx);
  const rollback = sql
    .slice(idx + "-- rollback".length)
    .split("\n")
    .map((line) => line.replace(/^--\s?/, ""))
    .join("\n");
  return { forward, rollback };
}
