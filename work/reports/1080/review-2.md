---
task: "1080"
pass: 2
at: "2026-11-09T17:00:19.027Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/review-loop-cap-rounds-with-an-automatic
state: ok
tree_identity: "d196c37c4:f6a6e0eca"
---
## Verdict
needs some work — the pre-freeze light bar names `## Suggestions (non-blocking)`, but the output template asks for `## Suggestions` (review.ts:617, 819)

## Relevance
still relevant — the diff adds the freeze, the light bar and the accepted-scope quote, none of which exist on main.

## Evidence
None

## Bugs
**Heading literal hardcoded in the light-bar branch.** Class: a hardcoded heading string where the output heading is chosen per pass. The output template uses `suggestionsHeading`, which is `## Suggestions` before the freeze (review.ts:661). Two literals still say `## Suggestions (non-blocking)` on the non-frozen path:
- `src/server/review.ts:617`, the light-bar text in `blockingBarSection`: "goes under `## Suggestions (non-blocking)`". P3 and Easter-eggs tasks get this on pass 1.
- `src/server/review.ts:819`, the enumeration bullet, which uses the non-full wording for both light and frozen. Light passes get the wrong heading here too.

The frozen branch (lines 611, 631) and the full branch are correct. Fix: interpolate `suggestionsHeading` (or pass it in) at both sites, and add a test that a p3 mission names `## Suggestions` and not `(non-blocking)`. The existing light-bar test checks only "LIGHT bar" and "correctness bugs", so it would not catch this. I grepped the diff and touched files for other instances; there are none.

## Edge cases
- Prior pass 1 findings: #1 (unconditional full-bar bullet) is fixed at review.ts:814–822. #2 is only partly fixed; see the Bugs entry above. #3 (garbled engineer sentence) is fixed at config.ts:158–161. #4 (markdown folding) is fixed by the blank line in `docs/agent-workflow-rules.md`. Truncation marker and fence handling are fixed too.
- `acceptedScopeSection` locates the start heading without skipping fenced blocks, so a fenced `## Accepted scope` example would be quoted. Low risk.
- The freeze is prompt-only. The server does not stop a reviewer from putting a frozen-bar item under Bugs. That is acceptable for slice 1.
- Merge: `git merge-tree` shows a conflict only in `work/1080-…md`, which is bookkeeping and matches the landing checklist. No source conflicts. I ran that one read-only command, despite the checklist asking me not to.
- No new bare `node`, `npm` or `npx` in added lines.

## Suggestions
- Re-capture the app-root shot on the final tree. The handoff capture is stale (tree f6a6e0eca, reviewed HEAD d196c37c4). The change touches no visible UI beyond a search alias, so this is optional, not a blocker.
- `user-docs/review-and-close-out.md` says P3 and Easter-eggs tasks "use this lighter bar from pass 1" right after describing the frozen bar. Name the light bar explicitly.
- Remove the "Slice 1 covers only…" paragraph in `docs/agent-workflow-rules.md` once slice 2 lands.

## Could not verify (environment)
- I did not re-run the test suite (per the brief). The gate result is taken from the handoff.
- I did not check that the new control sits on the Settings tab the user docs name ("General").

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-09T16:06:06.048Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

