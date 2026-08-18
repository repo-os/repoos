---
id: "0248"
title: Split code changes tab by filename
type: feature
status: review
needs_merge: true
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/split-code-changes-tab-by-filename
model_override: default
pm_model_override: default
updated_at: "2026-08-18T13:13:12Z"
review_rounds: 1
---
## Problem

The "Changes" tab currently renders the entire unified diff as a single flat `<pre>` block. For tasks that touch many files, this forces the user to scroll through the entire diff linearly to find the file they care about. There is no way to see at a glance which files changed or jump directly to a specific file's changes.

## Desired UX

1. At the top of the Changes tab, below the existing stats summary, show a **compact file list**: each line is the filename (relative to repo root), an indicator for added/removed/modified, and the per-file line-count delta (e.g. `+4 -2`). This list is space-efficient — one line per file, no wrapping — and takes up minimal vertical space.

2. Clicking a filename in the list **scrolls to** that file's diff section within the same tab (anchor-style scroll into the diff output below). The file list and the diff output remain in the same scrollable panel, so the user never leaves the tab.

3. The diff output is **grouped by file**: each file's changes start with a collapsible header showing the filename. Clicking the header toggles visibility of that file's diff section. All sections start **expanded** by default so the tab behaves like it does today — no hidden content surprises.

4. The existing stats summary (Files / Added / Deleted) stays above the file list — it is not replaced.

## Acceptance criteria

- [ ] The file list is parsed from the unified diff headers (`diff --git a/... b/...`, `---`, `+++`) — no new server endpoint required; parsing happens client-side.
- [ ] Each file entry in the list shows: filename, modified/added/deleted badge, and per-file +/- line counts.
- [ ] Clicking a file name in the list scrolls the diff output to the corresponding file section.
- [ ] The diff output is split into per-file sections, each with a collapsible header bar showing the filename.
- [ ] All file sections default to expanded on first render.
- [ ] Collapsing/expanding a file section works via clicking its header.
- [ ] The existing stats summary block is preserved unchanged at the top.
- [ ] The truncation warning still appears when `taskDiff.truncated` is true.
- [ ] Empty diff state ("No code changes yet") remains unchanged.
- [ ] `repoos check` passes with no regressions.

## Notes for AI

- All changes live in `src/ui-app/src/components/TaskDrawer.vue`. No server or core changes needed.
- The `diffLines` computed (line ~1352) splits `taskDiff.patch` on `\n` into a flat string array. Replace or supplement this with a structured parse that groups lines by file, producing an array of `{ filename, lines: string[] }` objects.
- Keep the file list compact — use `monospace` font at a smaller size, truncate long paths with `text-overflow: ellipsis`, and cap the file list at a reasonable height with its own scroll if it exceeds ~8 entries (so it doesn't dominate the panel).
- The per-file diff header (collapsible) should reuse the existing `diff-header` CSS class styling for visual consistency.
- Do not add any new runtime dependencies. The parsing is straightforward string splitting on `diff --git` lines.
- Assume the diff is always in `git diff --patch` format (which it is, per `getDiff()` in `src/core/git.ts`).

## Activity

- 2026-08-18T02:28:20Z · status inbox→ready
- 2026-08-18T12:36:48Z · model_override
- 2026-08-18T12:37:22Z · status ready→active, branch
- 2026-08-18T12:49:45Z · watchdog: auto-surfaced stuck task · status active→review · agent exited without emitting the handoff signal · next step: the handoff signal may not have been emitted on its own line — the agent's final line must be exactly `::repoos-handoff-ready::` (see #0154/#0155 for signal-line rendering bugs)
- 2026-08-18T12:49:45Z · status review→active
- 2026-08-18T13:11:41Z · pm_model_override
- 2026-08-18T13:13:12Z · status active→review
- 2026-08-18T13:13:12Z · needs_merge
