---
updated_at: "2026-10-13T07:37:01Z"
review_passes: 1
id: "0761"
title: "Shots for non-web targets: native macOS, iOS/Android and desktop apps (command-based capture)"
type: feature
status: review
priority: p2
area: [core, server, cli]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/shots-for-non-web-targets-native-macos-i
created_at: "2026-10-13T06:23:05Z"
---
## Problem
RepoOS's evidence shots (repoos shot, the handoff capture, ## Shots) only work for web targets: a [[preview.targets]] dev server plus a headless browser. A repo whose product is a native macOS app, a mobile app or a desktop app gets 'shots: skipped — website matched only documentation content, and no declared shot names a route' on every UI task, so reviewers and the maintainer never see an image of the change. Observed in the Divot repo (a native macOS menu bar app, tasks #0070-#0077).

## Desired UX
- A repo can declare a non-web capture target whose capture is a command, not a URL. The command produces one or more image files; RepoOS collects them as the task's shots, with the same captions (declared: label / auto: matched glob), stale-tree detection, Changes-tab display, retention and gitignore rules as web shots.
- Typical commands: a test or script that renders a native view offscreen to PNG (for example AppKit bitmapImageRepForCachingDisplay inside swift test), xcrun simctl io <device> screenshot for iOS simulator, adb exec-out screencap for Android emulator, screencapture for a desktop window.
- Declared per task in ## Shots with the target name and a label, exactly like web shots, or matched automatically by [[preview.paths]] globs for the target.
- The skip message becomes accurate and actionable for non-web repos: say that no capture target covers the changed paths and point at how to declare a command target.

## Acceptance criteria
- New config shape in repoos.toml, for example [[shot.targets]] with name, areas, paths, command, outputGlob (or an output directory passed to the command in an env var such as REPOOS_SHOT_DIR), timeoutMs, and optional requires (a binary that must exist; a missing binary records a visible 'skipped' note, never a failed handoff). Web preview targets keep working unchanged.
- Captured files are stored under work/.attachments/<taskId>/shots/ (gitignored), never tracked: the existing task-asset guard must keep failing on any tracked image or PDF under work/ and inputs/, and a command target must not write into tracked paths by default. Document that evidence images are never committed to git.
- Captions, highlight metadata where not applicable are omitted gracefully, stale-capture detection against the branch HEAD tree, duplicate collapsing and per-task limits behave as for web shots.
- Handoff capture runs the command in the task worktree with a timeout, records stdout/stderr tail on failure as a visible note, and never blocks handoff.
- repoos shot <target> works for command targets from the CLI.
- Every user-facing repoos.toml setting gets a Settings UI control and a test (repo rule), unless documented as raw-TOML-only.
- Zero runtime dependencies; use the repo's runtime conventions (Bun first).
- Tests: command target happy path, missing required binary, timeout, no output files, gitignore/tracked-asset guard, caption and stale-tree behaviour, and web targets unaffected.
- Docs: user-docs and docs/ updated, including a short recipe for native macOS (offscreen render in a test), iOS simulator and Android emulator.

## Notes for AI
Start from src/core/shot-plan.ts and the shot capture path used at handoff (see docs and the #0594/#0603/#0613 notes in AGENTS.md). Keep the model general: a capture target is something that yields image files; web is one implementation. Do not hard-code Apple/Android tools; commands are user-configured. Never git add attachments. This is a RepoOS product feature for everyone using RepoOS; Divot will be the first consumer afterwards.

## Shots
```json
[
{
"label": "Settings search finds the capture-targets setting",
"target": "default",
"route": "/settings",
"highlight": ".search-overlay",
"steps": [
{
  "click": ".settings-search-trigger"
},
{
  "fill": ".search-overlay-input",
  "text": "capture targets"
},
{
  "waitMs": 400
}
]
}
]
```

## Activity

- 2026-10-13T06:23:05Z · created · njachowski@gmail.com
- 2026-10-13T06:49:00Z · status inbox→ready
- 2026-10-13T06:49:03Z · status ready→active, branch
- 2026-10-13T07:14:07Z · body
- 2026-10-13T07:16:03Z · body
- 2026-10-13T07:27:40Z · body: section Shots
- 2026-10-13T07:35:46Z · status active→review
- 2026-10-13T07:37:01Z · note: review pass 1: needs some work

