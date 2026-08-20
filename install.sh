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

info()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
error() { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

command -v node >/dev/null 2>&1 || error "Node.js is required but was not found on PATH. Install Node >= 20.6.0 and re-run."

node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" -lt 20 ]; then
  error "Node.js >= 20.6.0 is required (found $(node -v))."
fi

command -v curl >/dev/null 2>&1 || error "curl is required but was not found on PATH."
command -v tar  >/dev/null 2>&1 || error "tar is required but was not found on PATH."

info "Installing RepoOS to ${INSTALL_DIR}"
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

curl -fsSL "$RELEASE_URL" -o "$tmpfile" || error "Failed to download release from ${RELEASE_URL}"
tar -xzf "$tmpfile" -C "$INSTALL_DIR"

chmod +x "$INSTALL_DIR/cli/index.js"

cat > "$BIN_DIR/repoos" <<EOF
#!/usr/bin/env bash
exec node --no-warnings "$INSTALL_DIR/cli/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/repoos"

info "Installed repoos -> ${BIN_DIR}/repoos"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    printf '\n\033[1;33mNote:\033[0m %s is not on your PATH.\n' "$BIN_DIR"
    printf 'Add this to your shell profile:\n\n  export PATH="%s:$PATH"\n\n' "$BIN_DIR"
    ;;
esac

info "Run 'repoos init' to get started."
