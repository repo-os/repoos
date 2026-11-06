---
task: 1040
pass: 2
at: "2026-11-06T05:18:03.168Z"
agent: reviewer
cli: github copilot
model: default
branch: feat/easter-eggs-bundle-card-details-link-and
state: ok
tree_identity: "d68352d8d:36f39f662"
---
## Verdict
needs some work — the interactive rows are exposed inside a non-interactive tooltip role.

## Relevance
still relevant — the base branch still has the redundant card link and non-clickable preview rows.

## Evidence
None

## Bugs
- **Interactive-tooltip semantics** — `src/ui-app/src/components/TaskCard.vue:1570-1597`: the `role="tooltip"` container now contains three focusable button rows, while the trigger describes that container as tooltip text. Tooltip semantics are for non-interactive content and can misrepresent or obscure these controls to assistive technology. Use interactive popover semantics and an appropriate trigger relationship for all three rows.

## Edge cases
None found

## Suggestions
The E2 handoff capture (`default-2.png`) shows no popover, consistent with the recorded hover timeout; regenerate it after the fix. Held, error, and human-step card blurbs share the same button, with no separate card “Details” link.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

