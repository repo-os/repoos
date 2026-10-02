/** Parse a unified diff into per-file sections with stats (shared by the Changes and Merge conflict views). */
export interface DiffFile {
  filename: string;
  lines: string[];
  added: number;
  removed: number;
  type: "added" | "deleted" | "modified";
}

export function parseDiffFiles(patch: string | undefined | null): DiffFile[] {
  if (!patch) return [];
  const sections = patch.split(/^diff --git /m);
  const files: DiffFile[] = [];
  for (const section of sections) {
    if (!section.trim()) continue;
    const lines = section.split("\n");
    const diffLines = ["diff --git " + lines[0], ...lines.slice(1)];
    const plusLine = diffLines.find((l) => l.startsWith("+++ "));
    const minusLine = diffLines.find((l) => l.startsWith("--- "));
    const isAdd = diffLines.some((l) => l.startsWith("--- /dev/null"));
    const isDel = diffLines.some((l) => l.startsWith("+++ /dev/null"));
    const plusName = plusLine ? plusLine.slice(6) : "";
    const minusName = minusLine ? minusLine.slice(6) : "";
    const filename = isDel ? minusName : plusName;
    if (!filename || filename === "/dev/null") continue;
    let added = 0;
    let removed = 0;
    for (const l of diffLines) {
      if (l.startsWith("+") && !l.startsWith("+++ ")) added++;
      else if (l.startsWith("-") && !l.startsWith("--- ")) removed++;
    }
    files.push({
      filename,
      lines: diffLines,
      added,
      removed,
      type: isAdd ? "added" : isDel ? "deleted" : "modified",
    });
  }
  return files;
}

/** Classify a single diff line for syntax highlighting. */
export function diffLineClass(line: string): string {
  if (line.startsWith("@@")) return "diff-hunk";
  if (line.startsWith("+")) return "diff-add";
  if (line.startsWith("-")) return "diff-rem";
  if (
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  )
    return "diff-header";
  return "diff-ctx";
}
