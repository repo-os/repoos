---
task: "1163"
pass: 3
at: "2026-11-17T21:35:02.821Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/investigate-checks-tab-browser-pass-stal
state: ok
tree_identity: "63accd75c:63accd75cf"
---
## Verdict
good to go — EVIDENCE-GAP-ONLY: the sole capture shows Mission Control, not Checks; code and WebKit matrix pass.

## Relevance
still relevant — main still leaves the Checks local-slot poll uncleaned (latest `ChecksView.vue` change is #1149), and no newer task covers the responsive Checks pass.

## Evidence
- `default-1.png` (auto: matched `src/ui-app/**`, route `/`) shows Mission Control, not `/checks`; it cannot evidence tab navigation or the 1440/390/320 × light/dark matrix. The matrix is proved by the new `src/commands/ui-smoke.ts` assertions instead. Handoff console log: zero errors, acceptable.

## Bugs
None found

No further findings of this class were found after grepping: `ChecksView.vue` (both polls), `RemoteRunnersPanel.vue`, `TestRunPanel.vue`, `IntegrationPipelineSummary.vue`, `CheckRunsPanel.vue`, `useNow.ts`, `reminders.ts`, `repo.ts` (app-lifetime timer), `App.vue` teardown, the new test's mount/unmount path, `ui-smoke.ts` page/context teardown, and the diff for bare `node`/`npm`/`npx` invocations (none).

## Edge cases
- Pass 1's blocker is fixed and verified: `localSlotPoll` is stored and cleared beside `activeCheckPoll`, and the fake-timer test installs fake time before mount, so it genuinely fails on main's uncleared interval (13/13 in that file pass). Pass 2's width/theme gap is closed by the new built-app matrix.
- The matrix skips when Playwright is not installed, so responsive coverage is conditional on the gate environment.
- The original repeated-capture slowdown remains unattributed; the report states this explicitly and no follow-up task exists.
- Per-tab checks assert query, `aria-selected` and body width only — a blank panel would pass — and only `pageerror`, not console errors, is collected on `checksPage`.
- Report source `63accd75c` differs from HEAD `e8708ae` only by `round-3.json`, so its claims match the reviewed tree.

## Suggestions
- Declare a shot for `/checks?tab=now` (and e.g. `?tab=plan`) at 390/320 so the Changes tab shows the page that changed.
- Replace the fixed `waitForTimeout(50)` with `waitForFunction` on the `?tab=` query/aria-selected, and unmount in a `finally` so a failing assertion cannot leave the 5 s poll running into later tests.
- File the capture-trace follow-up if the repeated-capture slowdown is expected to recur.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-17T21:31:47.761Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

