#!/usr/bin/env bash
# RepoOS installer.
#   curl -fsSL https://repoos.org/install | bash
#
# Downloads the latest prebuilt release tarball from GitHub Releases and
# installs a `repoos` launcher on PATH. Runs on Bun when it's installed
# (recommended); otherwise requires Node.js >= 20.6.0.
#
# Pipe to bash, matching the docs: `curl -fsSL https://repoos.org/install | bash`.
set -eu
# `pipefail` is a bash/zsh extension; enable it only when the shell supports it
# so the script also runs under POSIX-only shells such as dash (/bin/sh).
case "${BASH_VERSION:-}${ZSH_VERSION:-}" in
  '') ;;
  *) set -o pipefail 2>/dev/null || true ;;
esac

REPO="repo-os/repoos"
# Install payload and machine state are different directories. State stays in
# ~/.repoos (servers, services.json, local-check-slots, agent-run-tmp). The
# tarball unpacks to ~/.local/share/repoos unless REPOOS_INSTALL_DIR is set.
INSTALL_DIR="${REPOOS_INSTALL_DIR:-$HOME/.local/share/repoos}"
STATE_DIR="$HOME/.repoos"
# Names shipped in repoos-dist.tar.gz. A legacy install unpacked these into
# STATE_DIR; reinstall deletes only these names there so runtime state survives.
PAYLOAD_NAMES="cli commands core server ui .build-info.json"
BIN_DIR="${REPOOS_BIN_DIR:-$HOME/.local/bin}"
RELEASE_URL="https://github.com/${REPO}/releases/latest/download/repoos-dist.tar.gz"

# --- Color / terminal helpers ------------------------------------------------
# POSIX-safe ANSI codes (no $'...' quoting, which dash/bin/sh cannot parse).
# Color is enabled only when output goes to a terminal and the terminfo has
# color support; NO_COLOR=1 forces it off. Check both stdout and stderr, since
# progress prints to stdout while errors print to stderr.
if [ "${NO_COLOR:-}" != "1" ] && { [ -t 1 ] || [ -t 2 ]; } &&
   command -v tput >/dev/null 2>&1 &&
   tput setaf 1 >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD=$(printf '\033[1m');  DIM=$(printf '\033[2m');  RESET=$(printf '\033[0m')
  CYAN=$(printf '\033[36m'); MAGENTA=$(printf '\033[35m'); GREEN=$(printf '\033[32m')
  RED=$(printf '\033[31m'); YELLOW=$(printf '\033[33m'); GRAY=$(printf '\033[90m')
else
  BOLD=''; DIM=''; RESET=''; CYAN=''; MAGENTA=''; GREEN=''; RED=''
  YELLOW=''; BLUE=''; GRAY=''
fi

step()  { printf '%s  %s%s%s\n' "${GRAY}›$RESET" "${BOLD}" "$1" "$RESET"; }
ok()    { printf '%s  %s✔ %s%s%s\n' "${GRAY}›$RESET" "${GREEN}" "$1" "$RESET"; }
info()  { printf '  %s%s%s%s\n' "${DIM}" "$1" "$RESET"; }
warn()  { printf '%s  %s! %s%s%s\n' "${YELLOW}›$RESET" "$YELLOW" "$1" "$RESET"; }
err()   { printf '\n%s  %s✖ %s%s\n' "${RED}›$RESET" "$RED" "$1" "$RESET" >&2; exit 1; }
banner() {
  # "REPOOS" in block letters, drawn top-to-bottom with a cyan-to-magenta
  # gradient for a bit of pop. (Was previously drawing the "R" glyph twice
  # instead of R-E-P-O-O-S, so it read as "REROOS".)
  printf '%s\n' \
"
${CYAN}   ██████╗ ███████╗██████╗  ██████╗  ██████╗ ███████╗
${CYAN}   ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝
${CYAN}   ██████╔╝█████╗  ██████╔╝██║   ██║██║   ██║███████╗
${MAGENTA}   ██╔══██╗██╔══╝  ██╔═══╝ ██║   ██║██║   ██║╚════██║
${MAGENTA}   ██║  ██║███████╗██║     ╚██████╔╝╚██████╔╝███████║
${MAGENTA}   ╚═╝  ╚═╝╚══════╝╚═╝      ╚═════╝  ╚═════╝ ╚══════╝${RESET}"
  printf '%s  %srepoos installer%s\n\n' "${GRAY}   ›$RESET" "$CYAN" "$RESET"
}

# --- Preflight ---------------------------------------------------------------
# RepoOS runs on Bun when it's installed (faster) and falls back to Node.
if command -v bun >/dev/null 2>&1; then
  runtime_note="Bun $(bun --version 2>/dev/null || echo '?')"
elif command -v node >/dev/null 2>&1; then
  # 20.6.0 matches package.json "engines". Major-only checks accepted 20.0–20.5.
  if ! node -e 'const p=process.versions.node.split(".").map(function(n){return parseInt(n,10)||0}); if(!(p[0]>20||(p[0]===20&&(p[1]>6||(p[1]===6))))) process.exit(1)'; then
    err "Node.js >= 20.6.0 is required when Bun isn't installed (found $(node -v)). Install Bun (https://bun.sh) or a newer Node."
  fi
  runtime_note="Node $(node -v)"
else
  err "RepoOS needs Bun (recommended, https://bun.sh) or Node.js >= 20.6.0 on PATH."
fi
command -v curl >/dev/null 2>&1 || err "curl is required but was not found on PATH."
command -v tar  >/dev/null 2>&1 || err "tar is required but was not found on PATH."

# --- Detect OS / architecture ------------------------------------------------
os=$(uname -s)
case "$os" in
  Linux)  os_label="linux" ;;
  Darwin) os_label="macos" ;;
  *)      os_label=$(printf '%s' "$os" | tr '[:upper:]' '[:lower:]') ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64)                 arch_label="x86_64" ;;
  aarch64|arm64)                arch_label="aarch64" ;;
  i386|i686|x86)                arch_label="i386" ;;
  *)                            arch_label="$arch" ;;
esac

banner
step "detected ${CYAN}${os_label}/${arch_label}${RESET}"
step "runtime ${CYAN}${runtime_note}${RESET}"

# --- Resolve the latest release version (best-effort, non-fatal) --------------
# The version is purely cosmetic. If the GitHub API is unreachable or rate
# limited, we still install via the direct redirect download URL.
version=""
step "fetching latest release manifest..."
if command -v sed >/dev/null 2>&1; then
  version=$(curl -fsSL --max-time 10 \
    "https://api.github.com/repos/${REPO}/releases/latest" 2>/dev/null \
    | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' || true)
fi
[ -n "$version" ] || step "using latest release from GitHub Releases"

# --- Download -----------------------------------------------------------------
step "downloading${version:+ ${CYAN}${version}${RESET}}..."
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
curl -fsSL "$RELEASE_URL" -o "$tmpfile" \
  || err "Failed to download release from ${RELEASE_URL}"

# --- Install ------------------------------------------------------------------
step "installing to ${BOLD}${INSTALL_DIR}${RESET}..."
# Never delete STATE_DIR itself: that directory holds runtime state. When the
# install dir is somewhere else, drop only a legacy payload left in STATE_DIR.
if [ "$INSTALL_DIR" != "$STATE_DIR" ] && [ -f "$STATE_DIR/cli/index.js" ]; then
  step "moving a legacy install out of ${BOLD}${STATE_DIR}${RESET} (keeping runtime state)..."
  for name in $PAYLOAD_NAMES; do
    rm -rf "$STATE_DIR/$name"
  done
fi
if [ "$INSTALL_DIR" = "$STATE_DIR" ]; then
  for name in $PAYLOAD_NAMES; do
    rm -rf "$INSTALL_DIR/$name"
  done
  mkdir -p "$INSTALL_DIR" "$BIN_DIR"
else
  rm -rf "$INSTALL_DIR"
  mkdir -p "$INSTALL_DIR" "$BIN_DIR"
fi
tar -xzf "$tmpfile" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/cli/index.js"

# Keep in sync with launcherScript() in src/core/launcher-runtime.ts (a test compares
# the two). The runtime is picked each time `repoos` runs, not at install time.
cat > "$BIN_DIR/repoos" <<EOF
#!/usr/bin/env bash
# repoos launcher: Bun when available, Node otherwise (REPOOS_RUNTIME=node pins Node).
# Runtime discovery order (non-interactive SSH often has a minimal PATH):
#   1. Bun — REPOOS_BUN_PATH, PATH bun, ~/.bun/bin/bun, mise shims, Homebrew/usr/local, bundled install copy
#   2. Node — PATH node, mise shims, nvm default alias, Homebrew /usr/local /usr/bin
entry="$INSTALL_DIR/cli/index.js"
install_root="\$(cd "\$(dirname "\$entry")/.." && pwd)"
home="\${HOME:-}"

_repoos_try() {
  [ -n "\$1" ] && [ -x "\$1" ] && printf "%s\n" "\$1"
}

_repoos_find_bun() {
  [ "\${REPOOS_RUNTIME:-}" = "node" ] && return 1
  local c
  if [ -n "\${REPOOS_BUN_PATH:-}" ]; then
    c="\$(_repoos_try "\${REPOOS_BUN_PATH}")" && { printf "%s\n" "\$c"; return; }
    return 1
  fi
  c="\$(_repoos_try "\$(command -v bun 2>/dev/null || true)")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "\${home}/.bun/bin/bun")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "\${home}/.local/share/mise/shims/bun")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "/opt/homebrew/bin/bun")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "/usr/local/bin/bun")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "\${install_root}/bun/bin/bun")" && { printf "%s\n" "\$c"; return; }
  return 1
}

_repoos_nvm_node_path() {
  local nvm_dir="\$1" ver="\$2" stripped candidate c
  stripped="\${ver#v}"
  for candidate in "\$ver" "\$stripped" "v\${stripped}"; do
    [ -z "\$candidate" ] && continue
    c="\$(_repoos_try "\${nvm_dir}/versions/node/\${candidate}/bin/node")" && { printf "%s\n" "\$c"; return 0; }
  done
  return 1
}

_repoos_find_nvm_node() {
  local nvm_dir ver hop alias_path c
  nvm_dir="\${NVM_DIR:-\${home}/.nvm}"
  [ -f "\${nvm_dir}/alias/default" ] || return 1
  ver="\$(tr -d "[:space:]" < "\${nvm_dir}/alias/default")"
  [ -n "\$ver" ] || return 1
  hop=0
  while [ -n "\$ver" ] && [ "\$hop" -lt 4 ]; do
    c="\$(_repoos_nvm_node_path "\$nvm_dir" "\$ver")" && { printf "%s\n" "\$c"; return 0; }
    alias_path="\${nvm_dir}/alias/\${ver}"
    if [ -f "\$alias_path" ]; then
      ver="\$(tr -d "[:space:]" < "\$alias_path")"
      hop=\$((hop + 1))
    else
      return 1
    fi
  done
  return 1
}

_repoos_find_node() {
  local c
  c="\$(_repoos_try "\$(command -v node 2>/dev/null || true)")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "\${home}/.local/share/mise/shims/node")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_find_nvm_node 2>/dev/null)" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "/opt/homebrew/bin/node")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "/usr/local/bin/node")" && { printf "%s\n" "\$c"; return; }
  c="\$(_repoos_try "/usr/bin/node")" && { printf "%s\n" "\$c"; return; }
  return 1
}

runtime="\$(_repoos_find_bun 2>/dev/null | head -n 1 || true)"
if [ -n "\$runtime" ]; then exec "\$runtime" "\$entry" "\$@"; fi

runtime="\$(_repoos_find_node 2>/dev/null | head -n 1 || true)"
if [ -n "\$runtime" ]; then exec "\$runtime" --no-warnings "\$entry" "\$@"; fi

{
  printf "repoos: no JavaScript runtime found.\n" >&2
  printf "Looked for Bun and Node in:\n" >&2
  printf "  - REPOOS_BUN_PATH and bun on PATH\n" >&2
  printf "  - ~/.bun/bin/bun\n" >&2
  printf "  - ~/.local/share/mise/shims (bun and node)\n" >&2
  printf "  - nvm default (alias/default, with alias hops and v-prefixed version dirs)\n" >&2
  printf "  - bundled Bun at <install>/bun/bin/bun (when shipped)\n" >&2
  printf "  - /opt/homebrew/bin, /usr/local/bin, and /usr/bin\n" >&2
  printf "\n" >&2
  printf "Install Bun (recommended): curl -fsSL https://bun.sh/install | bash\n" >&2
  printf "Or install Node.js >= 20.6.0, set REPOOS_BUN_PATH=/path/to/bun,\n" >&2
  printf "or run repoos upgrade after installing a runtime (refreshes this launcher).\n" >&2
} >&2
exit 1
EOF
chmod +x "$BIN_DIR/repoos"

ok "installed ${BOLD}repoos${RESET}${version:+ ${DIM}${version}${RESET}} to ${BOLD}${BIN_DIR}/repoos${RESET}"
info "(runtime lives in ${DIM}${INSTALL_DIR}${RESET})"

# --- PATH note -----------------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    warn "${BOLD}${BIN_DIR}${RESET} is not on your PATH."
    printf '%s\n' \
"  ${DIM}Add this line to your shell profile (e.g. ~/.bashrc or ~/.zshrc):${RESET}" \
"  ${BOLD}export PATH=\"${BIN_DIR}:\$PATH\"${RESET}"
    ;;
esac

# --- Ready ----------------------------------------------------------------------
printf '\n%s\n' "${GREEN}   ready.${RESET} run ${BOLD}repoos${RESET} to get started."
printf '%s\n' "   ${DIM}or ${BOLD}repoos init${RESET}${DIM} to set up a new workspace.${RESET}"
