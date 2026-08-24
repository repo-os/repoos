#!/usr/bin/env bash
# RepoOS installer.
#   curl -fsSL https://raw.githubusercontent.com/repo-os/repoos/main/install.sh | bash
#
# Downloads the latest prebuilt release tarball from GitHub Releases and
# installs a `repoos` launcher on PATH. Requires Node.js >= 20.6.0.
set -euo pipefail

REPO="repo-os/repoos"
INSTALL_DIR="${REPOOS_INSTALL_DIR:-$HOME/.repoos}"
BIN_DIR="${REPOOS_BIN_DIR:-$HOME/.local/bin}"
RELEASE_URL="https://github.com/${REPO}/releases/latest/download/repoos-dist.tar.gz"

# --- Color / terminal helpers ------------------------------------------------
if [ -t 1 ] && [ "${NO_COLOR:-}" != "1" ] && command -v tput >/dev/null 2>&1 &&
   tput setaf 1 >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD=$'\033[1m';  DIM=$'\033[2m';  RESET=$'\033[0m'
  CYAN=$'\033[36m'; MAGENTA=$'\033[35m'; GREEN=$'\033[32m'; RED=$'\033[31m'
  YELLOW=$'\033[33m'; BLUE=$'\033[34m'; GRAY=$'\033[90m'
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
  printf '%s\n' \
"${MAGENTA}
   ██████╗ ███████╗██████╗  ██████╗  ██████╗ ███████╗
   ██╔══██╗██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝
   ██████╔╝█████╗  ██████╔╝██║   ██║██║   ██║███████╗
   ██╔══██╗██╔══╝  ██╔══██╗██║   ██║██║   ██║╚════██║
   ██║  ██║███████╗██║  ██║╚██████╔╝╚██████╔╝███████║
   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝ ╚══════╝${RESET}"
  printf '%s  %srepoos installer%s\n\n' "${GRAY}   ›$RESET" "$CYAN" "$RESET"
}

# --- Preflight ---------------------------------------------------------------
command -v node >/dev/null 2>&1 || \
  err "Node.js is required but was not found on PATH. Install Node >= 20.6.0 and re-run."
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  err "Node.js >= 20.6.0 is required (found $(node -v))."
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

# --- Resolve the latest release version ---------------------------------------
step "fetching latest release manifest..."
version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$version" ] || err "Could not determine the latest release version."

# --- Download -----------------------------------------------------------------
step "downloading ${CYAN}${version}${RESET}..."
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT
curl -fsSL "$RELEASE_URL" -o "$tmpfile" \
  || err "Failed to download release from ${RELEASE_URL}"

# --- Install ------------------------------------------------------------------
step "installing to ${BOLD}${INSTALL_DIR}${RESET}..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"
tar -xzf "$tmpfile" -C "$INSTALL_DIR"
chmod +x "$INSTALL_DIR/cli/index.js"

cat > "$BIN_DIR/repoos" <<EOF
#!/usr/bin/env bash
exec node --no-warnings "$INSTALL_DIR/cli/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/repoos"

ok "installed ${BOLD}repoos${RESET} ${DIM}${version}${RESET} to ${BOLD}${BIN_DIR}/repoos${RESET}"
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
