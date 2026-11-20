---
task: "1255"
pass: 3
at: "2026-11-20T00:18:24.945Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-update-banner-version-display-an
state: ok
tree_identity: "bde1aa6c5:bde1aa6c5b"
---
## Verdict

`needs some work` — the pass-2 list-marker class fix is still incomplete: `.td-markdown` and `.guide-markdown` chat surfaces remain markerless and unguarded.

## Relevance

`still relevant` — the QA premise holds; the round-2 copy/layout/fixture fixes are real, and the shots render their declared states.

## Evidence

None — all three captures (release-notes modal with bullets, systemd restart notice, restart-failure alert naming the command) match the diff, routeMatched, zero console errors, and only bookkeeping changed between capture tree bde1aa6c5 and reviewed HEAD c990c8dd6, so the evidence is current.

## Bugs

- **Class: missing-list-style-declaration (Tailwind preflight strips list markers)** — the shared rule at `src/ui-app/src/style.css:7645-7662` and `MARKDOWN_SURFACES` in `src/ui-app/tests/markdown-list-markers.test.ts` cover six surfaces but omit the two chat surfaces that render assistant messages via `renderChatMarkdown()` with `padding-left: 17px` and no `list-style` anywhere (checked both SFC style blocks — only `p`/`code`/`pre`/`a` are styled):
  - `.td-markdown :deep(ul/ol)` — `src/ui-app/src/components/TaskDebuggerChat.vue:494` (assistant bubbles, line 261).
  - `.guide-markdown :deep(ul/ol)` — `src/ui-app/src/components/RepoGuideChat.vue:445` (assistant bubbles, line 258).
  Agent replies containing lists in the task-debugger and repo-guide chat panels render indented without bullets — the exact defect round 2's shared rule was meant to close, and the round-2 report/QA doc describe coverage that does not include these two files.

No further findings of this class were found after grepping: every `renderMarkdown()`/`renderChatMarkdown()` call site in `src/ui-app/src`, all `*-markdown` container classes and their `list-style`/`:deep(ul/ol)` rules in `style.css` and component style blocks, the `MARKDOWN_SURFACES` test table, the QA doc's surface list, and `docs/qa/measure-update-banner.mjs` for bare `node`/`npm`/`npx` (none; shebang is `bun`, `node:` imports are builtins only).

## Edge cases

- The supervised waiting line (`ReleaseUpdateNotification.vue:374`) lacks `release-update-status`, so it shares the row with Cancel while the new CSS comment and round-2 report claim own-row works in both layouts — hand-run only, in practice.
- Real hand-run restart stays unproven by design (faked POST, honestly recorded) — human follow-up.
- The QA doc names the waiting-line test "…and keeps list bullets (#1255)"; the actual test has no such suffix — trivial doc drift.

## Suggestions

- Add `td-markdown`/`guide-markdown` to the shared rule and the test table; better, have `renderChatMarkdown()` emit a shared marker class so new surfaces can't regress.
- Correct the `.release-update-status` comment (and supervised markup or wording) so claim matches layout.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:16:09.847Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

