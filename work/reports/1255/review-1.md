---
id: review-1
title: review-1
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/qa-pass-update-banner-version-display-an
task: "1255"
pass: 1
at: "2026-11-19T23:50:24.217Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
state: ok
tree_identity: "f2c1be984:e5bc092e85"
---
## Verdict

`needs some work` — the diff itself is sound (fixes verified in shots), but the list-marker fix reveals an unfixed sibling class: every other markdown surface still renders lists without bullets.

## Relevance

`still relevant` — the QA premise holds; the pass found and fixed real defects and the fixtures/coverage match the acceptance criteria.

## Evidence

None — all three captures (release-notes modal with bullets, systemd restart notice, restart-failure alert naming the command) render the declared states on the app target, routeMatched, zero console errors, and tree e5bc092e differs from reviewed HEAD f2c1be984 only by bookkeeping.

## Bugs

- **Class: missing-list-style-declaration (Tailwind preflight strips list markers)** — `docs/qa/2026-11-update-banner-qa.md` fixed the release-notes surface by adding `list-style: disc/decimal` to `.release-update-markdown`, but the same preflight reset still strips markers from every other `renderMarkdown()`/`renderChatMarkdown()` surface, all of which set `padding-left` (indentation without markers — the exact defect class fixed here):
- `.md-rendered ul/ol` (`src/ui-app/src/style.css:7631`) — used by `StoryPanel.vue` (story bodies), `TaskDrawer.vue` (review reports), `ContextView.vue`, `InputsView.vue`.
- `.pm-markdown ul/ol` (`src/ui-app/src/style.css:16626`) — `PmChatSurface.vue`.
- `.cto-markdown :deep(ul/ol)` — `src/ui-app/src/components/CTOPanel.vue:342`.
- `.debugger-markdown :deep(ul/ol)` — `src/ui-app/src/components/DebuggerChat.vue:543`.
- `.playground-markdown` — `src/ui-app/src/components/ModelPlaygroundPanel.vue` (no `ul` rule at all).

No further findings of this class were found after grepping: all `list-style` declarations in `src/ui-app/src/style.css` and `src/ui-app/src/components/*.vue`, all `renderMarkdown`/`renderChatMarkdown` call sites, `::marker` usage, bare `node`/`npm`/`npx` invocations in the new script, docs and package scripts, and `repoos.toml` (untouched, per the task note).

## Edge cases

- Restart/discard behavior is fixture-only by design; a real hand-run restart remains unproven (QA doc records this honestly — human follow-up).
- Sidebar `.build-ver` is hidden at 375/768 px; recorded as an observation, version still visible elsewhere. Worth tracing the CSS cause eventually.
- Hand-run "waiting" line sits inside `.release-update-manual` (grid), so the new `.release-update-actions > [role="status"]` row rule only applies to the supervised layout — correct today, fragile if the markup shifts.

## Suggestions

- Consider a shared rule (e.g. on a common markdown container class) instead of per-surface `list-style` re-declarations, so the next markdown surface doesn't regress.

<span style="display:none">Reviews-1255-9f4f32</span>

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T23:46:49.955Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

