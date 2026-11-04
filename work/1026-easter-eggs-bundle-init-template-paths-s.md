---
id: 1026
title: "Easter eggs bundle: init template paths, serve banner, CLI docs and empty-repo edge cases"
type: chore
status: inbox
priority: p2
area: [core, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-04T06:45:41Z"
updated_at: "2026-11-04T12:58:42Z"
---
## Items

- E1 · Generated AGENTS.md template references nonexistent paths
- E2 · `serve` banner and docs: say which interfaces are bound
- E3 · cli.md missing commands
- E4 · Empty-repo git edge cases
- E5 · Quieter `repoos list` with no server
- E6 · Doc and message accuracy nits
- E7 · Hold dialog styling, optional reason, and held-card padding

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body.


## E1 · Generated AGENTS.md template references nonexistent paths

### Problem

`repoos init`'s template (src/commands/init.ts ~L211, ~L335) cites RepoOS-internal paths such as `docs/agent-process-safety.md` and `src/core/shot-plan.ts` (6 in total), so `repoos doctor` warns on a brand-new project.

### Desired UX

A fresh `repoos init` project passes `repoos doctor` with no warnings.

### Acceptance criteria

- [ai] Test: init a temp project and assert doctor reports no missing-path warnings.

### Notes for AI

Strip RepoOS-internal paths from the template; link docs.repoos.org URLs where a reference is useful. This edits the `repoos init` template, not this repo's AGENTS.md.

## E2 · `serve` banner and docs: say which interfaces are bound

### Problem

`serve` binds 127.0.0.1 by default but 0.0.0.0 when Tailscale is detected (src/commands/serve.ts ~L72-91), advertises the Tailscale IP with an HTTPS warning, while docs call it a local server.

### Desired UX

The startup banner states the bound interface; docs explain that Tailscale detection widens the bind and that `--host 127.0.0.1` forces localhost.

### Acceptance criteria

- [ai] Test: banner text for both the Tailscale and plain branches.

### Notes for AI

Behavior is intentional; do not change the default bind.

## E3 · cli.md missing commands

### Problem

cli.md lacks `repoos uninstall`, `repoos service` and `--version`.

### Desired UX

All three are documented.

### Acceptance criteria

- [ai] Test: assert each command name appears in the CLI docs.

### Notes for AI

Match the existing cli.md format.

## E4 · Empty-repo git edge cases

### Problem

In a git-init'd repo with no commits: `repoos status` says "git: not a git repository"; the first `repoos new` prints "commit failed" even with identity set via env vars; the `init --new` identity warning ignores env-var identity (GIT_AUTHOR_*/GIT_COMMITTER_*). `new` auto-commits and this is undocumented.

### Desired UX

Repo and identity detection are correct in a zero-commit repo and with env-var identity; auto-commit is documented.

### Acceptance criteria

- [ai] Test: zero-commit repo and env-var identity fixtures for status, new and init --new.

### Notes for AI

Likely one shared cause in repo/identity detection; check before fixing three times.

## E5 · Quieter `repoos list` with no server

### Problem

With no server running, `repoos list` prints a long "Can't reach the RepoOS server…" warning before the board.

### Desired UX

One short line, then the board.

### Acceptance criteria

- [ai] Test: output snapshot.

### Notes for AI

Keep the actionable hint (how to start the server).

## E6 · Doc and message accuracy nits

### Problem

`repoos check` references `user-docs/check.md` instead of a URL; docs say "no board database" but serve creates gitignored `.repoos/repoos.db`.

### Desired UX

The message links a docs URL; the docs sentence is accurate.

### Acceptance criteria

- [ai] Test: string assertions on both.

### Notes for AI

Source: external QA report on v0.5.75, items 3, 4, 13-18.

## E7 · Hold dialog styling, optional reason, and held-card padding

### Problem

The Hold task dialog (screenshots attached, from #0715) renders its Reason textarea and Auto-release date input with no visible field chrome: they read as plain text, unlike other textareas and date inputs in the app. The "Hold task" button is disabled until a reason is typed, but a reason is not needed to hold a task (the CLI takes `--reason` as optional context). On the task panel, the "Held — automation won't start this task" card has uneven padding: the text, the Release hold / Release and start buttons and the card edges are cramped.

### Desired UX

The Reason textarea and the date input use the shared rounded, outlined field styles (the global `ff-textarea` and the form-field classes in `src/ui-app/src/style.css`), with a visible focus ring, matching the other drawers and dialogs. The Hold task button is enabled with an empty reason; the hold is stored without `hold_reason` (or a neutral default) and the held card handles a missing reason without showing a blank line or the word "pause". The held card on the task panel has even padding on all sides and consistent gaps between the title, reason, byline and buttons.

### Acceptance criteria

- [ai] Test: the hold dialog's Hold task button is enabled with an empty reason and submits successfully.
- [ai] Test: a held task with no reason renders the held card without an empty reason row.
- [ai] The textarea and date input pick up the shared field classes (no bespoke colors; passes the hardcoded-colors and contrast guards in light and dark).
- [ai] Declared `## Shots`: hold dialog and held card on the task panel.

### Notes for AI

Check the server hold route (`repoos hold` / `POST /api/tasks/:id/hold`) accepts an empty reason before relaxing the UI; keep CLI behavior unchanged. Dialog must use the shared `ui/dialog/*` components per AGENTS.md. Bundle is now at 7 items; keep this one in its own commit.


## Activity

- 2026-11-04T06:45:41Z · created · njachowski@gmail.com
- 2026-11-04T06:45:42Z · needs_input
- 2026-11-04T06:45:56Z · body: Items (added 3, removed 2); E1 · Generated AGENTS.md template references nonexistent paths (added 8, removed 3); E2 · `serve` banner and docs: say which interfaces are bound (added); E3 · cli.md missing commands (added 8, removed 3); E4 · Empty-repo git edge cases (added 8, removed 3); E5 · Quieter `repoos list` with no server (added 8, removed 3); E6 · Doc and message accuracy nits (added); E2 · `serve` banner/docs (removed); E6 · Doc/message accuracy nits (removed); Notes for AI (removed)
- 2026-11-04T06:46:01Z · needs_input
- 2026-11-04T12:58:41Z · body: Items (added 1)
- 2026-11-04T12:58:42Z · body: E7 · Hold dialog styling, optional reason, and held-card padding (added)
