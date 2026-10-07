---
id: "0726"
title: Stories (and inputs) dirs don't get the same close-out bookkeeping handling as the work dir
type: bug
status: inbox
priority: p2
area: [server, cli]
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-07T00:35:48Z"
updated_at: "2026-10-07T00:35:48Z"
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

## Activity

- 2026-10-07T00:35:48Z · created · unknown
