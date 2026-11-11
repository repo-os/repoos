---
task: "1080"
pass: 1
at: "2026-11-09T15:40:47.175Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-loop-cap-rounds-with-an-automatic
state: ok
tree_identity: "e7f7da4f5:a9ebe0da5"
---
## Verdict
needs some work — the unchanged "list every instance under Bugs" rule defeats the freeze and light bar; engineer prompt sentence is garbled

## Relevance
still relevant — nothing on main implements the freeze or the light bar, and the slice-1 premise holds.

## Evidence
None

## Bugs
1. **Full-bar instruction left unconditional beside the bar switch.** `src/server/review.ts` ~797–806, "Earlier passes and the whole bug class": "list them all under ## Bugs. Never hold an instance back for a later pass." This applies on every pass. From pass 5, it tells the reviewer to put further edge cases of an already-fixed class under Bugs, contradicting the frozen section. For P3 and Easter-eggs tasks at pass 1, it contradicts the light bar. The prompt therefore does not switch as criteria 1–2 require. Grepping `reviewMission` for "Bugs", "whole class", "hold back" and "list them all" finds no other instance. Fix: make this bullet conditional on the bar, or reword it to "within your bar's scope". Add a test asserting the frozen and light prompts do not contain it.
2. **Heading literal hardcoded in a second place.** `blockingBarSection`, `src/server/review.ts` ~624: "Quote them under `## Suggestions` at most". On the frozen bar the output heading is `## Suggestions (non-blocking)`, so the reviewer sees two headings. The parser accepts both, so nothing breaks. Fix: interpolate `suggestionsHeading` (or pass the heading into the function).
3. **Garbled engineer prompt sentence.** `src/core/config.ts` ~158–161, `DEFAULT_AGENTS` engineer instructions: `"...instead of patching one. Before handoff, " + "A new config key needs a Settings control..."`. The "Before handoff," clause dangles and is shipped to every engineer. The only instance of this concatenation-edit pattern in the diff, and no test covers the wording.
4. **Markdown folding.** `docs/agent-workflow-rules.md` ~144: the "Slice 1 covers only…" paragraph follows the last bullet with no blank line, so it renders as a continuation of that bullet. Only instance.

## Edge cases
- `acceptedScopeSection` (`review.ts` ~313–328) truncates at 4000 characters with no marker, so items past the cut silently disappear from the reviewer's view. A `## ` line inside a fenced block ends the section early. Only the first "Accepted scope" heading is quoted.
- The freeze is prompt-only. Nothing on the server stops a reviewer from writing a frozen-bar finding under Bugs and setting `needs some work`. Acceptable for slice 1, but it means bug 1 matters.
- The engineer's report says the scoped check was not re-run after the scope cut, while the handoff gate records `passed`. Confirm the gate result on `a9ebe0da5`. I did not re-run tests.
- `default-agent-prompts.test.ts` asserts that the frozen text is present but not that the contradicting bullet is absent, which is why bug 1 passes the suite.
- Shell and runtime: no new bare `node`, `npm` or `npx` in added lines.
- Merge: the landing checklist shows only the task file conflicting, and the task-file diff is RepoOS bookkeeping only. Source files are not in conflict.

## Suggestions
- Add a `[truncated]` marker when the accepted-scope quote hits the cap.
- The handoff capture is the app root only, and the change adds no UI logic (only a settings alias string), so no visual evidence is needed. The Settings control itself is not captured; optional.
- Criteria 4–7 are deferred to #1081 as the owner asked. Bugs 1 and 2 are slice-1 defects and should be fixed here.

Housekeeping references: #1076 (stray other-task bookkeeping) and #1061 (bookkeeping commits invalidating checks) remain out of scope, as the spec says.

## Verdict
needs some work — the unchanged "list every instance under Bugs" rule defeats the freeze and light bar; engineer prompt sentence is garbled

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T15:39:23.015Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

