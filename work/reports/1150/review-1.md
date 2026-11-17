---
task: "1150"
pass: 1
at: "2026-11-17T12:01:21.602Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/stories-mobile-cards-preserve-enough-tit
state: ok
tree_identity: "b497caae3:80c611b9a"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: the CSS is correct, but the only handoff capture is a 1024×800 desktop shot, so the mobile behaviour is visually unverified.

## Relevance
`still relevant` — base `StoriesView.vue` still clips names, excerpts and live task titles with `nowrap`/ellipsis on phones, and no other landed task covers it.

## Evidence
- `Stories cards with readable mobile task names` (/stories, target `default`): captured at 1024×800 with no `viewportWidth`, so the `max-width: 720px` rules never applied — the PNG still shows desktop ellipses (`#1128 … landing pag…`). It needs `viewportWidth: 390` (ideally 320 too) to verify the change.
- Only the light theme is captured, though the task notes ask for both themes.

## Bugs
None found

No further findings of this class were found after grepping: every `.story-name`, `.story-name-row`, `.story-excerpt`, `.story-live-row/-title/-dot/-cue` definition and usage (no sibling stylesheet or component defines them), the pre-existing `@media (max-width: 720px)` block (`#1145` header rules, progress/chevron rules), and the `stories-view.test.ts` breakpoint assertions.

## Edge cases
- 320px: `.story-live-cue` is `flex: none`; the widest cue (`Not fully fleshed out`) plus a one-character title break should be eyeballed — the 375px gate checks horizontal overflow, not crowding.
- Wrapped first lines can run under the absolutely positioned mobile chevron (right 14px, top 16px) because `.story-head` padding is 16px; text stays identifiable across lines, but the tail is cramped.
- Removing the excerpt clamp makes long-description cards tall; acceptable for scanning, worth a look at 320px.

## Suggestions
- Declare a 390px (and 320px) shot, plus a dark-theme entry, so review evidence matches the criterion the task is judged by.
- The new test splits on the first `@media (max-width: 720px)` and matches everything after it, not inside the block; a desktop rule added later could satisfy it. Scope by taking the block body.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T11:59:02.308Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

