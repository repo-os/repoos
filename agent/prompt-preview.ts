/**
 * The opening of the canonical prompt, for the compact call-to-action preview.
 * Kept in a Bun-readable module (no `?raw` import) so the landing and docs build
 * checks can compare what each site renders with agent/starter-prompt.md.
 */
export function promptPreview(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 3)
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .join("\n");
}
