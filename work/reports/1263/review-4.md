---
task: "1263"
pass: 4
at: "2026-11-20T07:20:25.679Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-settings-general-agents-and-budg
state: ok
tree_identity: "e935ce52d:1b96ffc75"
---
## Verdict
`needs some work` — EVIDENCE-GAP-ONLY: code is sound; both declared captures are stale (tree 1b96ffc75) and show loading skeletons.

## Relevance
`still relevant` — the Settings/Agents QA premise holds and this round fixes the last verified blocker (Model routing tab clipped at 1280px).

## Evidence
- `default-1.png` (Settings General, `/settings?tab=general`) — STALE (tree 1b96ffc75 ≠ HEAD e935ce52d) and shows only skeleton placeholders with `[aria-busy]`, not the declared named-controls state.
- `default-2.png` (Agents Budget Controls, `/agents?tab=budget-controls`) — same: stale, loading-state capture. Re-capture both on the final tree.

## Bugs

None found

The delta since pass 3 (tree 1b96ffc75) is exactly two files: `style.css` makes `.agent-tabs` wrap at every width (removes the scrollbar-hidden `overflow-x: auto` that clipped "Model routing" at 1280px — the handoff gate failure) and `mobile-touch-affordances.test.ts` updates the #1139 regexes to assert wrap everywhere and no `overflow-x: auto`. Both regexes are well-formed (`[^}]*` cannot cross a rule) and the base block satisfies them; the `.agents-page > .agent-tabs` and media-query sibling rules carry no conflicting overflow. All pass-1/2/3 aria-label findings remain in place (verified in the full diff); Budget Controls' three un-aria-labelled `Input`s are each inside a wrapping `<label>` with visible text, so they are named. No new bare `node`/`npm`/`npx` invocations; the new test uses Bun-compatible `node:fs` imports and the existing `ui-harness`/`ui-smoke` infra.

No further findings of this class were found after grepping: style.css (.agent-tabs, .agents-page rules), mobile-touch-affordances.test.ts, ChecksView.vue, AgentsView.vue, SettingsView.vue, BudgetControlsPanel.vue, AgentCard.vue, BuiltInAgentCard.vue, ScheduledTasksPanel.vue, RemoteValidationDrawer.vue, ServiceSettings.vue, SettingsImportExport.vue, TelegramSettingsPanel.vue, AuthSettingsPanel.vue, and the new test file.
- Browser verification: Handoff browser verification recorded 2 blocking issue(s): [missing-target] Settings General with every setting control named (target "default"): loading state detected: loading indicator [aria-busy="true"] on /settings?tab=general; [missing-target] Agents Budget Controls tab with named controls (target "default"): loading state detected: loading indicator [aria-busy="true"] on /agents?tab=budget-controls
## Edge cases
- The wrap change also applies to the Checks page tab strip (`.ck-tabs.agent-tabs`) — same class, consistent and desirable, but its row height can grow at narrow widths.
- The probe's `named()` still counts any non-empty `textContent` as a name (carried over from pass 3); focus audit proves a change exists, not sufficient contrast.

## Suggestions
- Re-capture both declared shots on HEAD e935ce52d, waiting past the `[aria-busy]` loading phase so the captures show real controls.

## Could not verify (environment)
None

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 2 blocking issue(s): [missing-target] Settings General with every setting control named (target "default"): loading state detected: loading indicator [aria-busy="true"] on /settings?tab=general; [missing-target] Agents Budget Controls tab with named controls (target "default"): loading state detected: loading indicator [aria-busy="true"] on /agents?tab=budget-controls
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

