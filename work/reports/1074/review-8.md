---
task: "1074"
pass: 8
at: "2026-11-11T20:42:32.679Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/require-a-step-by-step-guide-on-every-hu
state: ok
tree_identity: "022a9e6d1:3205a7fbc"
---
Repeated review classes: fence-unaware heading scanning (passes 5–7) and the stale shot path in `1074.json` (passes 6–7). Heading scanning is fixed in every scanner this branch touches; the rest is pre-existing code listed under Suggestions. The shot path is still wrong. A human should look at this recurring pattern: each pass found the next copy of the same scanner, so file the class sweep as one task.

## Verdict
`good to go` — no blocking defects; every scanner this branch touches now uses the shared fence mask, and the drawer capture renders the warning on the reviewed tree.

## Relevance
`still relevant` — `main` only has the task file added (9a6f50875), with no guide requirement or warning landed elsewhere.

## Evidence
None. `default-1.png-1.png` (tree 3205a7fbc, the only non-bookkeeping code commit before HEAD) shows the red "Missing ## Step-by-step guide" banner above the human-task banner on the Changes tab. Since 3205a7fbc, only `work/` files changed.

## Bugs
None found

## Edge cases
- An unclosed fence is treated as plain text, but CommonMark and the drawer's markdown renderer run it to end of document. This is a deliberate tradeoff, but `markdown-fence.ts` is headed "CommonMark fence helpers", which overstates it.
- A stray opener that pairs with a later real block's opener hides the lines between them. That matches CommonMark.
- `humanTaskGuideSectionFilled` only accepts `1.` numbering, so a `1)` guide is reported as still empty.

## Suggestions (non-blocking)
- **Fence-unaware scanners outside this diff (same class, pre-existing):** `easter-eggs-bundle.ts` (~109–165, 231), `task-summary.ts:475` `splitBodyAndActivity`, `task.ts:201` `mergeDuplicateActivitySections` (counts unmasked headings), `shot-plan.ts:228`, `ui-app/src/lib/shot-rows.ts:172`, `cto-actions.ts:166`, `engineer-crash-recovery.ts:527/550/589`, and `review.ts` `nextFenceState`. File one sweep task.
- **`src/commands/init.ts` (~304–305):** the shipped AGENTS template still says to split human criteria with no guide requirement. The spec says "wherever the built-in prompts live", so either add it here or file a follow-up.
- **Broken capture link:** `1074.json` and `shots.json` record `default-1.png`, but the file on disk is `default-1.png-1.png`, so the drawer's Changes-tab link is broken. This is a RepoOS shot-naming bug outside this diff; file it.
- **Scaffold warning:** `repoos new --human` always prints "still empty" because the placeholder is present. This is intended, but the spec asked only for the missing-heading warning, so say so in the CLI help.
- Accepted-scope items are not re-reported.

## Could not verify (environment)
- Test suite and build not re-run, per the brief.
- Landing checklist: the "(4 pass, 1 warn, 1 fail)" summary does not match its listed items, which show 0 FAIL. I took the listed items as the facts. The only conflict is the task's own file, which close-out resolves.

## Automated verification
Not applicable to this section; RepoOS appends it after this report.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T20:39:53.766Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

