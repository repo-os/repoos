# Detect and install

## Is it already installed?

```bash
command -v repoos
repoos --version
```

If `repoos` is on `PATH`, it is installed — do not install a second copy.

## Is this repository already initialized?

`repoos.toml` at the repository root is the reliable marker. Check for it, and
look at the layout it declares:

```bash
test -f repoos.toml && echo "already initialized"
grep -E '^(workDir|docsDir)\s*=' repoos.toml 2>/dev/null
```

A `repoos/` directory, `AGENTS.md`, or `repoos/work/` are supporting signals, but
`repoos.toml` is the one that decides. Do not treat an unrelated `work/`
directory as a RepoOS layout.

If both the binary and `repoos.toml` exist, the repository is ready — read
[tasks and stories](tasks-and-stories.md) instead of installing anything.

## Install

Choose one. curl is the zero-dependency default; the package managers install
the same CLI.

```bash
curl -fsSL https://repoos.org/install | bash
brew install repo-os/tap/repoos
npm install -g @repo-os/repoos
bun add -g @repo-os/repoos
pnpm add -g @repo-os/repoos
mise use --global npm:@repo-os/repoos
```

Ask the user before running a global install, and tell them which method you
chose and why. After installing, confirm with:

```bash
repoos --version
repoos --help
```

Update with the same tool that installed it. `repoos upgrade` is only for the
curl install; for Homebrew, npm, Bun, pnpm, or mise it prints the matching
update command rather than modifying that install.

Read more:
[Getting started → Install](https://docs.repoos.org/getting-started#install).

The public source of this skill is
[https://github.com/repo-os/repoos/tree/main/agent/skill](https://github.com/repo-os/repoos/tree/main/agent/skill).
Claude Code, Cursor, Codex, and similar agents fetch that one directory and
install it under their own skills location (for example
`~/.claude/skills/repoos/`); this repository does not keep provider-specific
copies.
