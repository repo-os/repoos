---
id: "0726"
title: Stories (and inputs) dirs don't get the same close-out bookkeeping handling as the work dir
type: bug
status: active
priority: p2
area: [server, cli]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: feat/stories-and-inputs-dirs-don-t-get-the-sa
created_at: "2026-10-07T00:35:48Z"
updated_at: "2026-10-07T17:17:52Z"
close_out_repair_count: 1
review_passes: 1
---
## Problem

Owner suspected the stories dir is not handled like the work and inputs dirs. Checked against main on 2026-10-07. What IS handled for all three: the bookkeeping-only drift exemption (integration-orchestrator.ts bookkeepingDirPrefixes covers workDir, inputsDir, storiesDir + dist/), the watcher (watcher.ts watches stories via storiesDirOf), and server-side commits (docs(stories): ..., inputs(<id>): capture, docs(<id>): ...). What is NOT:

1. Foreign-file reset at close-out: resetForeignWorkFiles (integration-orchestrator.ts ~1573) takes only workDir. A feature branch that edits ANOTHER task's work file is reset to main's copy, but edits to other stories/*.md or inputs/*.md on the branch publish as-is (same drift class as #0319's work-file frontmatter drift).
2. Conflict auto-resolve: done.ts autoResolve = [<own task file>, 'dist/']. Conflicts in stories/ or inputs/ files (server-written, main-owned) are not auto-resolved to main's copy and fail the close-out.
3. The publish-time dirty-main guard (done.ts ~580) lists any dirty file as blocking except the cache dir; stories/inputs files the server just wrote (and has not yet committed) block close-out like task files do, and 'Commit & continue' commits them without distinction.
4. repoos doctor checks layout dirs (layout.work-dir, layout.inputs-dir) but has no stories-dir check; check.ts's task-asset guard prefixes list only workDir/inputsDir (commands/check.ts ~481-484).
5. Layout: init does not write storiesDir or the stories/inputs ignore lines for the repoos/ layout (tracked separately as #0703); with a custom layout the dirs are respected via storiesDirOf but nothing validates them.

## Desired UX

- One shared helper returns the bookkeeping dirs (work, inputs, stories) from config; foreign-file reset, conflict auto-resolve and dirty-main classification use it, so adding a new managed dir is one change.
- Close-out resets other stories'/inputs' files to main's copy and auto-resolves conflicts in them to main's version (only the task's own files may differ).
- doctor reports the stories dir like work/inputs and the task-asset guard covers all three.

## Acceptance criteria

- Tests: a branch editing another story file and another input file is reset to main at close-out; a stories/ conflict auto-resolves to main; custom storiesDir/inputsDir/workDir layouts (e.g. repoos/stories) behave the same as the defaults; doctor shows the stories dir.
- Docs updated (docs/close-out-pipeline.md). repoos check passes.

## Notes for AI

VERIFY each gap on current main before changing it (some may have been fixed by #0637/#0674/#0711). Related: #0703, #0711, #0713.

## Config / Settings parity (added 2026-10-07)

Checked how the three dirs are defined in src/core/config.ts:

- `storiesDir`: parsed through `normalizeRelativeDir` (#0637: rejects absolute, `~`, backslash and `..` paths, falls back to the default with a warning), has a Settings entry (label 'Stories directory', tier guarded, restartRequired) and is listed in SUPPORTED_TOML_KEYS.
- `inputsDir`: listed in SUPPORTED_TOML_KEYS but parsed with only `typeof === 'string'` (no validation: an absolute or `..` path is accepted and would point RepoOS outside the repo) and has NO Settings schema entry (the layout group has workDir, docsDir, skillsDir, storiesDir, cacheDir only), so it cannot be changed or even seen in Settings.
- `workDir` / `docsDir`: Settings entries exist; confirm they go through the same relative-dir validation.
- `repoos init` writes none of storiesDir / inputsDir (see #0703) and nothing warns when a configured dir does not exist; `repoos doctor` checks work and inputs but not stories.

Desired: validate all layout dirs with normalizeRelativeDir, give inputsDir a Settings entry matching storiesDir (guarded, restartRequired, same description style), make init write all three for non-default layouts, and have doctor check all three. Tests: inputsDir '../x' falls back with a warning; Settings schema lists all three; init for the repoos/ layout writes storiesDir and inputsDir.

## Activity

- 2026-10-07T00:35:48Z · created · unknown
- 2026-10-07T00:37:22Z · body
- 2026-10-07T16:44:26Z · status inbox→ready
- 2026-10-07T16:44:55Z · status ready→active, branch
- 2026-10-07T16:58:40Z · body
- 2026-10-07T17:00:56Z · body
- 2026-10-07T17:02:27Z · body
- 2026-10-07T17:03:20Z · body
- 2026-10-07T17:13:17Z · status active→review
- 2026-10-07T17:13:18Z · note: shots: skipped — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped
- 2026-10-07T17:14:40Z · note: review pass 1: good to go
- 2026-10-07T17:15:37Z · status review→active
- 2026-10-07T17:15:37Z · note: close-out repair: merge-conflict
- 2026-10-07T17:17:52Z · body
