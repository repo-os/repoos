/**
 * The curl-installed `repoos` launcher (`~/.local/bin/repoos`). `install.sh`
 * writes it from the same template as `repoos upgrade`; `launcher.test.ts`
 * keeps the two in sync.
 *
 * Non-interactive SSH sessions often export a minimal PATH, so the launcher
 * cannot rely on `command -v` alone — it probes the usual Bun, mise, nvm, and
 * system locations before failing with an actionable message.
 */

/** Human-readable list of probe locations (for errors and docs). Keep in sync with the bash below. */
export const LAUNCHER_RUNTIME_PROBE_SUMMARY = [
  "REPOOS_BUN_PATH and bun on PATH",
  "~/.bun/bin/bun",
  "~/.local/share/mise/shims (bun and node)",
  "nvm default (alias/default, with alias hops and v-prefixed version dirs)",
  "bundled Bun at <install>/bun/bin/bun (when shipped)",
  "/opt/homebrew/bin, /usr/local/bin, and /usr/bin",
] as const;

function launcherProbeErrorPrintfs(): string[] {
  return LAUNCHER_RUNTIME_PROBE_SUMMARY.map(
    (line) => `  printf "  - ${line.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}\\n" >&2`,
  );
}

/**
 * Bash body shared by install.sh and `launcherScript()`. `entryLine` is the
 * full `entry=…` assignment (absolute path for upgrades, `$INSTALL_DIR/…` in
 * install.sh).
 */
function launcherScriptBody(entryLine: string): string {
  return [
    "#!/usr/bin/env bash",
    "# repoos launcher: Bun when available, Node otherwise (REPOOS_RUNTIME=node pins Node).",
    "# Runtime discovery order (non-interactive SSH often has a minimal PATH):",
    "#   1. Bun — REPOOS_BUN_PATH, PATH bun, ~/.bun/bin/bun, mise shims, Homebrew/usr/local, bundled install copy",
    "#   2. Node — PATH node, mise shims, nvm default alias, Homebrew /usr/local /usr/bin",
    entryLine,
    'install_root="$(cd "$(dirname "$entry")/.." && pwd)"',
    'home="${HOME:-}"',
    "",
    "_repoos_try() {",
    '  [ -n "$1" ] && [ -x "$1" ] && printf "%s\\n" "$1"',
    "}",
    "",
    "_repoos_find_bun() {",
    '  [ "${REPOOS_RUNTIME:-}" = "node" ] && return 1',
    "  local c",
    '  if [ -n "${REPOOS_BUN_PATH:-}" ]; then',
    '    c="$(_repoos_try "${REPOOS_BUN_PATH}")" && { printf "%s\\n" "$c"; return; }',
    "    return 1",
    "  fi",
    '  c="$(_repoos_try "$(command -v bun 2>/dev/null || true)")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "${home}/.bun/bin/bun")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "${home}/.local/share/mise/shims/bun")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "/opt/homebrew/bin/bun")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "/usr/local/bin/bun")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "${install_root}/bun/bin/bun")" && { printf "%s\\n" "$c"; return; }',
    "  return 1",
    "}",
    "",
    "_repoos_nvm_node_path() {",
    '  local nvm_dir="$1" ver="$2" stripped candidate c',
    '  stripped="${ver#v}"',
    '  for candidate in "$ver" "$stripped" "v${stripped}"; do',
    '    [ -z "$candidate" ] && continue',
    '    c="$(_repoos_try "${nvm_dir}/versions/node/${candidate}/bin/node")" && { printf "%s\\n" "$c"; return 0; }',
    "  done",
    "  return 1",
    "}",
    "",
    "_repoos_find_nvm_node() {",
    "  local nvm_dir ver hop alias_path c",
    '  nvm_dir="${NVM_DIR:-${home}/.nvm}"',
    '  [ -f "${nvm_dir}/alias/default" ] || return 1',
    '  ver="$(tr -d "[:space:]" < "${nvm_dir}/alias/default")"',
    '  [ -n "$ver" ] || return 1',
    "  hop=0",
    '  while [ -n "$ver" ] && [ "$hop" -lt 4 ]; do',
    '    c="$(_repoos_nvm_node_path "$nvm_dir" "$ver")" && { printf "%s\\n" "$c"; return 0; }',
    '    alias_path="${nvm_dir}/alias/${ver}"',
    '    if [ -f "$alias_path" ]; then',
    '      ver="$(tr -d "[:space:]" < "$alias_path")"',
    "      hop=$((hop + 1))",
    "    else",
    "      return 1",
    "    fi",
    "  done",
    "  return 1",
    "}",
    "",
    "_repoos_find_node() {",
    "  local c",
    '  c="$(_repoos_try "$(command -v node 2>/dev/null || true)")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "${home}/.local/share/mise/shims/node")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_find_nvm_node 2>/dev/null)" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "/opt/homebrew/bin/node")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "/usr/local/bin/node")" && { printf "%s\\n" "$c"; return; }',
    '  c="$(_repoos_try "/usr/bin/node")" && { printf "%s\\n" "$c"; return; }',
    "  return 1",
    "}",
    "",
    'runtime="$(_repoos_find_bun 2>/dev/null | head -n 1 || true)"',
    'if [ -n "$runtime" ]; then exec "$runtime" "$entry" "$@"; fi',
    "",
    'runtime="$(_repoos_find_node 2>/dev/null | head -n 1 || true)"',
    'if [ -n "$runtime" ]; then exec "$runtime" --no-warnings "$entry" "$@"; fi',
    "",
    "{",
    '  printf "repoos: no JavaScript runtime found.\\n" >&2',
    '  printf "Looked for Bun and Node in:\\n" >&2',
    ...launcherProbeErrorPrintfs(),
    '  printf "\\n" >&2',
    '  printf "Install Bun (recommended): curl -fsSL https://bun.sh/install | bash\\n" >&2',
    '  printf "Or install Node.js >= 20.6.0, set REPOOS_BUN_PATH=/path/to/bun,\\n" >&2',
    '  printf "or run repoos upgrade after installing a runtime (refreshes this launcher).\\n" >&2',
    "} >&2",
    "exit 1",
    "",
  ].join("\n");
}

/** Escape `$` for install.sh's unquoted heredoc, except `$INSTALL_DIR`. */
function escapeInstallShHeredoc(script: string): string {
  return script.replace(/\$(?!INSTALL_DIR)/g, "\\$");
}

export function launcherScript(entry: string): string {
  const escapedEntry = entry.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return launcherScriptBody(`entry="${escapedEntry}"`);
}

/** Launcher body as written by install.sh (before `$INSTALL_DIR` is expanded). */
export function launcherScriptInstallShHeredoc(): string {
  return escapeInstallShHeredoc(launcherScriptBody('entry="$INSTALL_DIR/cli/index.js"'));
}
