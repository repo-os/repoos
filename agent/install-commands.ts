// The six published install commands, in the order both public sites show them.
// The landing llms.txt, the portable skill, and user-docs/getting-started.md are
// checked against this list by their builds. mise's short `-g` flag (used in
// landing/src/components/InstallBox.vue) is the same as `--global`; everything
// else must match exactly.
export const INSTALL_COMMANDS = [
  "curl -fsSL https://repoos.org/install | bash",
  "brew install repo-os/tap/repoos",
  "npm install -g @repo-os/repoos",
  "bun add -g @repo-os/repoos",
  "pnpm add -g @repo-os/repoos",
  "mise use --global npm:@repo-os/repoos",
] as const;

/** Collapse whitespace and treat mise's `-g` and `--global` as the same flag. */
export function normalizeInstallCommand(command: string): string {
  return command
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^mise use -g /, "mise use --global ");
}

/** A line that looks like one of the published install commands. */
function isInstallCommand(line: string): boolean {
  return (
    /^(?:curl|brew|npm|bun|pnpm|mise)\b/.test(line) &&
    /repoos\.org\/install|repo-os\/tap\/repoos|@repo-os\/repoos/.test(line)
  );
}

/** Every install-command line inside a Markdown document's fenced code blocks. */
export function extractInstallCommands(markdown: string): string[] {
  const commands: string[] = [];
  for (const block of markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
    for (const rawLine of block[1].split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !isInstallCommand(line)) continue;
      commands.push(normalizeInstallCommand(line));
    }
  }
  return commands;
}

/**
 * Compare one document's install commands with the published list. Returns
 * human-readable failures that name the file, so a build log points straight at
 * the stale copy.
 */
export function compareInstallCommands(label: string, actual: readonly string[]): string[] {
  const canonical = INSTALL_COMMANDS.map(normalizeInstallCommand);
  const found = new Set(actual.map(normalizeInstallCommand));
  const failures: string[] = [];

  for (const command of canonical) {
    if (!found.has(command)) {
      failures.push(`${label} is missing the published install command: ${command}`);
    }
  }
  for (const command of found) {
    if (!canonical.includes(command)) {
      failures.push(`${label} has an install command that is not published: ${command}`);
    }
  }

  return failures;
}
