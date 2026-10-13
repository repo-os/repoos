---
id: "0769"
title: "Let a ## Shots entry choose which images a command target captures (env, args or per-entry output glob)"
type: feature
status: active
priority: p2
area: [core, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/let-a-shots-entry-choose-which-images-a-
created_at: "2026-10-13T14:44:34Z"
updated_at: "2026-10-13T15:33:59Z"
---
## Problem
For command-based shot targets (#0761) a ## Shots declaration can only name the target ({"target": "Divot bar", "label": ...}); route, selector, highlight and steps are ignored for command targets, and RepoOS collects EVERY file matching the target's outputGlob. So a task cannot ask for 'just the world clock popover': the whole fixed snapshot set (27 PNGs of the bar and every other popover) is attached to every task that touches the paths, and the images that actually changed (a brand-new popover) may not be among them at all. Observed in the Divot repo on #0085: 27 shots, none of the feature under review. Reviewers and the maintainer wade through unrelated images and cannot tell what the task actually changed.

## Desired UX
- A ## Shots entry for a command target can pass selection to the command: an optional env map (for example {"DIVOT_SNAPSHOT_ONLY": "worldclock"}) and/or args, and an optional per-entry glob that narrows which produced files become THIS shot (for example "glob": "*worldclock*.png").
- Several entries for the same target each run the command with their own env and glob, each with its own label/caption, and the results are listed under that label; identical env/glob entries collapse as today.
- Automatic (undeclared) captures keep today's behaviour: the whole outputGlob, but capped by a configurable maximum per task (default sensible, e.g. 12) with a visible 'N more not shown' note so the Changes tab is not flooded.
- repoos shot --target <name> accepts --env KEY=VAL and --glob so an engineer can capture only what it changed.

## Acceptance criteria
- Shot-plan validation (src/core/shot-plan.ts) accepts env/args/glob for command targets, rejects them for web targets with a clear message, and rejects env keys that are not simple identifiers; values are passed through the environment only (no shell interpolation of declared values).
- The capture runner applies the entry's env/glob, collects only matching files, tags captions 'declared: <label>', and dedupes per entry.
- Per-task cap on automatic command captures with a visible note; the cap is a config key with a Settings control and test (repo rule).
- Tests: two declared entries on one target with different globs; entry env reaches the command; narrowing glob selects a subset; web target rejects the new fields; cap and note.
- Docs: user-docs/configuration.md and docs/previews.md updated with a native-app recipe showing a filter variable in the project's snapshot command.

## Notes for AI
Related: #0761, #0765, #0766. Keep zero runtime dependencies; never write images into tracked paths.

## Activity

- 2026-10-13T14:44:34Z · created · njachowski@gmail.com
- 2026-10-13T15:26:02Z · status inbox→ready
- 2026-10-13T15:26:05Z · status ready→active, branch
- 2026-10-13T15:33:58Z · message_queued at 2026-10-13T15:33:58.966Z
- 2026-10-13T15:33:59Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
