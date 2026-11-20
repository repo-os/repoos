---
task: "1274"
pass: 1
at: "2026-11-20T07:43:41.797Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-agents-page-model-providers-and-
state: ok
tree_identity: "c4e4d7801:eaf065d9be"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: code is correct and deterministic browser tests prove the layout; the single handoff capture shows an unrelated route.

## Relevance
`still relevant` — nothing on main supersedes the paused-state layout fix in BudgetControlsPanel; the premise (key-missing and paused states at three widths) still holds.

## Evidence
- The only capture (`auto: matched src/ui-app/**`, route `/`) shows the Mission Control dashboard, not the Budget Controls tab — it verifies a clean load with zero console errors but shows none of this diff's change. No state fixture exists for a paused budget allowlist, so a declared shot wasn't possible (documented by the engineer); the visual criterion is instead verified by the new table-driven WebKit case (real layout engine, fixed 375/768/1280 viewports, overflow + inside-card + chip-over-button assertions), which the gate ran green.

## Bugs
None found

No further findings of this class were found after grepping: sibling Agents-page components (ModelProvidersPanel, ModelRoutingPanel, RemindersPanel, ScheduledTasksPanel, AgentsView) for the fixed-reserve/pinned-absolute-button pattern (only BudgetControlsPanel had it; ModelProvidersPanel's `position: absolute` is a flash ring `::after`), native `title` attributes on the surface (only the pre-existing, intentionally tested `:title` on the "As of" span, ModelProvidersPanel:584), `style.css` for the 719.98px breakpoint convention (matches), and the diff/package.json/justfile/shebangs for new bare `node`/`npm`/`npx` invocations (none).

## Edge cases
- Grouped allowlist rows (`budget-source` chip) combined with a paused chip at 720–900px: the 212px reserve narrows the header column, but `max-width: 100%` + `overflow-wrap: anywhere` keeps the chip inside; rows just get taller. Acceptable.
- The phone media query applies to unpaused rows too — Pause/Remove drop under the header in flow; DOM order keeps them above the model list, so no collision.
- Between 720–800px with very long agent names plus a paused chip, wrapping makes multi-line chips — cosmetic only, still inside the card.

## Suggestions
- Add a `budget-allowlist-paused` state fixture so a future shot can declare and capture the paused state; the single auto capture on `/` is not useful evidence for this tab.
- Pre-existing (not this diff): replace the native `title` on the "As of" span in ModelProvidersPanel with a styled popover per AGENTS.md; the engineer correctly left it since #0625's unit test asserts it — worth a small follow-up.
- Focus-ring contrast on the shared underline buttons (engineer's own note) may be low-contrast; worth a later accessibility pass.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T07:41:36.492Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

