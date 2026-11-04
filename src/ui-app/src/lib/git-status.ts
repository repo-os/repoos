/**
 * Porcelain `XY` status codes → the two things the UI shows: the short chip
 * beside a path (`??`, `M`, `A`, …) and the word a person reads
 * (`untracked`, `modified`, `conflicted`, …).
 *
 * Shared by the sidebar git-state popover (#0584) and the uncommitted-changes
 * panel (#1030) so one dirty file never reads differently in the two places.
 */
export function statusLetter(code: string): string {
  if (code === "??") return "??";
  if (code.includes("U")) return "UU";
  const x = (code[0] ?? "").trim();
  if (x && x !== "?") return x;
  const y = (code[1] ?? "").trim();
  return y || "?";
}

export function statusWord(code: string): string {
  if (code === "??") return "untracked";
  if (code.includes("U")) return "conflicted";
  const words: Record<string, string> = {
    A: "added",
    D: "deleted",
    M: "modified",
    R: "renamed",
    C: "copied",
  };
  return words[statusLetter(code)] ?? "changed";
}
