---
id: 1025
title: "Install/uninstall: fix mise, PATH friction, Node check, ~/.repoos state split and uninstall accuracy"
type: bug
status: active
priority: p1
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/install-uninstall-fix-mise-path-friction
cli_override: cursor
model_override: grok-4.7-low
created_at: "2026-11-04T06:45:40Z"
updated_at: "2026-11-04T22:50:05Z"
---
## Problem
v0.5.75 QA on clean Debian 13 found install-method issues:
1. `mise use --global npm:@repo-os/repoos` fails: mise refuses under its 1000 weekly-downloads threshold; with `allow_low_downloads=true` it installs the previous version (mise minimum release age). `mise unuse --global` (which `repoos uninstall` suggests) leaves installs and a broken shim until `mise prune`.
2. `~/.repoos` is both install dir and runtime state: curl reinstall runs `rm -rf ~/.repoos`; `repoos uninstall` deletes it while saying user configuration was not changed; package-manager uninstalls leave `~/.repoos/servers` behind.
3. "Zero-dependency" copy is wrong: curl install needs Bun or Node >= 20.6.0. Home page says "Node 20+"; installer checks only major >= 20.
4. bun: `~/.bun/bin` not on PATH. pnpm: `ERR_PNPM_NO_GLOBAL_BIN_DIR`, and `pnpm setup` fails with `ERR_PNPM_UNKNOWN_SHELL` unless SHELL is set.
5. Homebrew formula pulls Homebrew Node + ~30 deps (~707 MB) although RepoOS runs on Bun.
6. Installer comment says `| sh` works; all docs say `| bash`.

## Desired UX
Every documented install method installs the current release as written on clean Linux, and its uninstall leaves nothing behind. Messages tell the truth.

## Acceptance criteria
- [ai] `repoos uninstall` message accurately says what was and was not removed; reinstall never wipes runtime state.
- [ai] Install dir and runtime state are separated (migration for existing `~/.repoos`), with uninstall cleaning state per method or saying exactly what remains.
- [ai] Installer checks Node >= 20.6.0; site/docs copy no longer claims zero dependencies where Bun/Node is required.
- [ai] Install docs note bun/pnpm PATH steps; mise is either documented with the flag + release-age delay and `mise prune`, or dropped from recommended methods (decide and state which in the PR).
- [ai] Evaluate dropping the Node dependency from the Homebrew formula; if the shebang fallback needs it, record why in docs/.
- [ai] Installer comment/docs agree on `| bash`.

## Notes for AI
Source: external QA report on v0.5.75 (items 1, 5, 8, 9, 10, 11, 20). Changing the state layout is a migration — verify existing installs keep working.

## Activity

- 2026-11-04T06:45:40Z · created · njachowski@gmail.com
- 2026-11-04T21:48:42Z · cli_override
- 2026-11-04T21:48:44Z · model_override
- 2026-11-04T21:48:50Z · model_override
- 2026-11-04T21:48:53Z · status inbox→ready
- 2026-11-04T22:33:01Z · status ready→active, branch
- 2026-11-04T22:42:15Z · body
- 2026-11-04T22:50:05Z · CTO nudge: held — handoff gate is running
