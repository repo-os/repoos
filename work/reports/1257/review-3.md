---
task: "1257"
pass: 3
at: "2026-11-20T02:16:16.146Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-search-saved-filters-
state: ok
tree_identity: "01fd95891:0b356a6e2c"
---
## Verdict
`good to go` — round-2 conflict is merged (main's side kept verbatim), the pass-2 edge cases are fixed, both declared shots match the final tree.

## Relevance
`still relevant` — the board genuinely applied no URL-carried queue filters before this branch; the shared predicate, chip bar and Clear control land that fix.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: `replace(/^#/` across src/ui-app (only `searchNeedle` is a search needle — the WorkView/StoriesView/InputsView/shot-fixture hits are task-id parsing, a different purpose), `trim().toLowerCase()` query normalisers (global search, ModelPlaygroundPanel, AgentModelModal — separate features, no chip/active-flag contract to break), bare `node|npm run|npx` additions in the diff (none; the QA doc's run lines use `bun run build:ui` / `bunx`), `git diff main HEAD` on main-touched files since the merge (telegram.ts, TelegramSettingsPanel.vue, repo.ts, stores — byte-identical to main, so the conflict resolution kept both sides), and `visibleByStatus` callers in WorkView.vue (board columns, keyboard nav, collapsed-empty logic all consume the filtered list).

Earlier findings verified fixed: pass-1's undeclared shots → two shots declared and captured on tree `0b356a6e2c` (HEAD differs only by bookkeeping, so evidence is current); pass-2's merge conflict → `cb1bc414b` merges main cleanly, and the remaining warning is only this task's own `work/1257` file, which close-out resolves from main. Round-3 changes are as reported: `searchNeedle` centralises the `#`/trim normalisation (covered by the "search of only #" test over `#`, ` # `, `""`), the `mine` notice now names the accepted value with a table-driven test over `0/2/true/yes`, and the mobile `filtersActive` flag uses the same needle.

## Edge cases
- The reload race (late `router.replace` vs a keystroke) and real-device touch targets remain documented-in-QA-doc-only; both are honestly deferred, not claimed as verified.
- `?q=#login` shows chip label "Search: #login" while matching on "login" — consistent with the existing `#0001` test, fine.

## Suggestions
- None

## Could not verify (environment)
None

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T02:13:58.737Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

