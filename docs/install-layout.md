# Install layout, mise, and the Homebrew Node dependency

## Directories

A curl install used to unpack the release tarball into `~/.repoos` and later
runs wrote machine state into the same directory (`servers/`, `services.json`,
`local-check-slots/`, `agent-run-tmp/`). `install.sh` then ran `rm -rf` on
that path on every reinstall, and `repoos uninstall` deleted it while saying
user configuration was unchanged.

Those are separate now:

| Path | What it is |
| --- | --- |
| `~/.local/share/repoos` | Standalone install (override with `REPOOS_INSTALL_DIR`) |
| `~/.local/bin/repoos` | Launcher (override with `REPOOS_BIN_DIR`) |
| `~/.repoos` | Machine state only |

Reinstall deletes the install directory, and if `~/.repoos/cli/index.js` is
still there from an older install it deletes only the tarball names (`cli`,
`commands`, `core`, `server`, `ui`, `.build-info.json`). State entries stay.
`repoos uninstall` removes the install, the launcher it owns, and those state
entries. Any other name under `~/.repoos` is printed and left in place.
Per-repo `repoos.toml` and `<repo>/.repoos/` are never removed.

`REPOOS_INSTALL_DIR=~/.repoos` still installs into the state directory, but
only the tarball names are replaced.

## mise

mise is not a recommended install method. `mise use --global npm:@repo-os/repoos`
refuses the package under mise's 1000-weekly-downloads threshold. Setting
`allow_low_downloads` gets past that and then hits mise's minimum release age,
which installs the previous version. `mise unuse --global` leaves the package
and a broken shim until `mise prune`. People who already installed that way
can remove it with `mise unuse --global npm:@repo-os/repoos && mise prune`.
`repoos upgrade` still recognizes a mise install path and prints
`mise upgrade npm:@repo-os/repoos`.

## Homebrew and Node

The curl launcher is a bash script that execs Bun when it can find one and
Node otherwise. It does not need Homebrew's Node.

The npm package bin is `dist/cli/index.js` with `#!/usr/bin/env node`.
Homebrew installs that bin the same way npm does, so the formula depends on
Node for the shebang even though RepoOS prefers Bun at runtime. Dropping
`depends_on "node"` in `repo-os/homebrew-tap` without also installing the bash
launcher would make `brew install repoos` fail on a machine that has Bun and
no `node` on `PATH`. The formula lives in that tap, not this repo; this
evaluation is why the dependency stays until the formula ships the launcher.

That Node fallback must be **20.6.0 or newer** (`package.json` `engines`, and
the same check in `install.sh`). A major-only `>= 20` check accepted 20.0
through 20.5, which cannot run the CLI.
