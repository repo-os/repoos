---
task: "1248"
pass: 1
at: "2026-11-19T22:21:41.140Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-inputs-and-context-uploads-with-
state: ok
tree_identity: "9ab4f7853:c35ae3c270"
---
## Verdict
`good to go` — Inputs upload path is guarded end to end with honest server status codes; Context limits were deliberately deferred with rationale, and the code is sound.

## Relevance
`still relevant` — upload QA on Inputs/Context is the live premise; nothing on main supersedes it.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: sibling upload routes (`tasks.ts`, `stories.ts`, `shots.ts`, `pm-attachments.ts` — all already validate type/size via `saveScreenshot`), message-to-status string mapping (`reminders.ts:47` uses the same house pattern), `readBody` callers, `SCREENSHOT_ACCEPT` vs the new guard (types match), `ff-error` / `.btn-row` CSS scope (fix is scoped to `.ff-upload-followup`), and `node:`/`npm`/`npx` usage in the diff (only `node:*` module imports, no invocations).

## Edge cases
- **Spec scope narrowed:** the task title names Context uploads too, but `NewDocPanel`/`NewSkillPanel` limits were deferred as open items. I checked both panels: they already render `uploadError` in `ff-error` blocks and handle `reader.onerror`, so failing uploads already say what went wrong; only limits are missing, and the QA doc records them as product decisions. Acceptable scoping, but the human should confirm the follow-ups get filed.
- `readBody` reads the whole body before the route's 413 check, so a direct API caller can still stream an unbounded body into memory. Pre-existing class, and the client guard covers the UI path.
- If `FileReader.onload` fires with a non-string result (never seen in practice), the slot stays empty with no notice — Submit stays disabled but the user gets no message. Negligible.
- Removing a still-reading pick: `onerror`'s `indexOf` guard handles the detach; the thumbnail write to a removed object is harmless.
- `watch(open)` clears notices on reopen while the screenshot draft survives (0498) — a returning user sees the picks but not why one was renamed. Minor, defensible.
- Server 400/413 messages echo `b.name` unsanitized — rendered as text via `{{ }}`, so no injection, just potential verbosity.

## Suggestions
- The auto handoff capture shows the Mission Control dashboard, not the touched New input panel (no shots were declared, so this is not a defect — the committed WebKit audit is the real visual proof). A declared shot of the panel with rejection notices at 375 px would make drawer review self-evident.
- `src/ui-app/src/stores/ui.ts` ~line 364: the old one-line JSDoc ("Read each image file into memory…") now sits directly above the new block comment — drop the stale one.
- The QA doc's open items (Context limits, `addScreenshots`/`addPmScreenshots` cap race and missing guards in the same file) deserve actual follow-up tasks if not already filed.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T22:18:58.519Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

