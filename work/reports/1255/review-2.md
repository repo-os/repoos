---
id: review-2
title: review-2
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/qa-pass-update-banner-version-display-an
task: "1255"
pass: 2
at: "2026-11-20T00:02:30.316Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
state: ok
tree_identity: "bde1aa6c5:e5bc092e85"
---
## Verdict

`needs some work` — the round-1 list-marker class fix is incomplete: two rendered-chat markdown surfaces (`td-markdown`, `guide-markdown`) are still missing markers, and the new guard test doesn't cover them.

## Relevance

`still relevant` — the QA premise holds; the product copy/layout fixes from round 1 are real and verified in code.

## Evidence

None — the three declared shots render their declared states on the app target, but the handoff capture is for tree e5bc092e85 while reviewed HEAD is bde1aa6c5 (round-2 CSS/test changes), so the captures are stale for the reviewed tree and should be re-captured.

## Bugs

- **Class: missing-list-style-declaration (Tailwind preflight strips list markers)** — Round 1's fix added the shared `list-style: disc/decimal` rule in `src/ui-app/src/style.css:7643` and a guard test (`src/ui-app/tests/markdown-list-markers.test.ts`), but both omit two sibling chat surfaces that call `renderChatMarkdown()` and indent lists without markers — the exact defect class from round 1:
- `.td-markdown ul/ol` — `src/ui-app/src/components/TaskDebuggerChat.vue:261,494` sets `padding-left` via `:deep(ul/ol)` with no `list-style` anywhere (checked `style.css:16224` — only `hr` is styled there).
- `.guide-markdown ul/ol` — `src/ui-app/src/components/RepoGuideChat.vue:258,445` — same, no `list-style` in the SFC, `style.css:16222` styles only `hr`.
Neither surface is in the shared rule nor in `MARKDOWN_SURFACES` in the test, so agent messages containing lists render indented but markerless on the task-debugger and repo-guide chat panels.

No further findings of this class were found after grepping: all `renderMarkdown()`/`renderChatMarkdown()` call sites in `src/ui-app/src`, every `*-markdown` container class and its `list-style`/`:deep(ul/ol)` rules in `style.css` and all component `<style>` blocks, the `MARKDOWN_SURFACES` test list, and the new QA harness for bare `node`/`npm`/`npx` (none; shebang is `bun`).

## Edge cases

- Real hand-run restart remains unproven by design (fixture-only, honestly recorded in the QA doc) — human follow-up.
- The playground indent regression test pins the exact source formatting of `ModelPlaygroundPanel.vue`; it will false-fail on reformat. Minor.
- The shared rule requires manually keeping the component surfaces and the test list in sync; the test enforces only the six listed names, which is how the two chat surfaces slipped through.

## Suggestions

- Add `td-markdown` and `guide-markdown` to the shared rule and `MARKDOWN_SURFACES`, or better, key the rule off a class the markdown renderers emit themselves so new surfaces can't be forgotten.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — zero console errors at capture time (stale tree; see Evidence).
- Guard negative-test evidence: **skipped** — no check guard rules materially changed on this branch.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T23:46:49.955Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

