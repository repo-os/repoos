---
id: 1026
title: "Easter eggs bundle: init template paths, serve banner, CLI docs and empty-repo edge cases"
type: chore
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "E1: missing Problem, Desired UX, Acceptance criteria, Notes for AI; E2: missing Problem, Desired UX, Acceptance criteria, Notes for AI; E3: missing Problem, Desired UX, Acceptance criteria, Notes for AI; E4: missing Problem, Desired UX, Acceptance criteria, Notes for AI; E5: missing Problem, Desired UX, Acceptance criteria, Notes for AI; E6: missing Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p2
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-04T06:45:41Z"
updated_at: "2026-11-04T06:45:42Z"
---
## Items
- E1 · Generated AGENTS.md template references nonexistent paths
- E2 · `serve` banner/docs: say which interfaces are bound
- E3 · cli.md missing commands
- E4 · Empty-repo git edge cases
- E5 · Quieter `repoos list` with no server
- E6 · Doc/message accuracy nits

## E1 · Generated AGENTS.md template references nonexistent paths
Problem: `repoos init` template in src/commands/init.ts (~L211, ~L335) cites `docs/agent-process-safety.md` and `src/core/shot-plan.ts` (and 4 other RepoOS-internal paths), so `repoos doctor` warns on a brand-new project.
Fix: strip RepoOS-internal paths from the template (link to docs.repoos.org URLs where useful).
Test: fresh `repoos init` project passes `repoos doctor` with no warnings.

## E2 · `serve` banner/docs
Problem: serve binds 127.0.0.1 by default but 0.0.0.0 when Tailscale is detected (src/commands/serve.ts ~L72-91), advertises the Tailscale IP with an HTTPS warning, while docs call it a local server. Behavior is intentional; do not change it.
Fix: startup banner states bound interfaces; docs state that Tailscale detection widens the bind and how to force localhost (`--host`).
Test: banner text for both branches.

## E3 · cli.md missing commands
Problem: cli.md lacks `repoos uninstall`, `repoos service`, `--version`.
Fix: document them.
Test: docs-vs-CLI command list check if one exists, else a simple assertion.

## E4 · Empty-repo git edge cases
Problem: in a git-init'd repo with no commits, `repoos status` says "git: not a git repository"; first `repoos new` prints "commit failed" even with identity set via env vars; `init --new` identity warning ignores env-var identity (GIT_AUTHOR_*/GIT_COMMITTER_*). `new` auto-commits and this is undocumented.
Fix: correct repo/identity detection (likely one shared cause), document the auto-commit.
Test: zero-commit repo and env-var identity fixtures.

## E5 · Quieter `repoos list` with no server
Problem: prints a long "Can't reach the RepoOS server…" warning before the board.
Fix: shorten to one line.
Test: output snapshot.

## E6 · Doc/message accuracy nits
Problem: `repoos check` points at `user-docs/check.md` instead of a URL; docs say "no board database" but serve creates gitignored `.repoos/repoos.db`.
Fix: use a docs URL; correct the docs sentence.
Test: string assertions.

## Notes for AI
Source: external QA report on v0.5.75 (items 3, 4, 13–18). Commit per item. Item 12 (VitePress `:::` markers raw in .md pages, llms.txt descriptions, .md links to HTML) is a possible later add if the bundle is under 6 items — otherwise leave it.

## Activity

- 2026-11-04T06:45:41Z · created · njachowski@gmail.com
- 2026-11-04T06:45:42Z · needs_input
