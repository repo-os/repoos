---
task: "1251"
pass: 1
at: "2026-11-19T23:23:59.015Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-work-board-in-a-project-with-hun
state: ok
tree_identity: "abf803a0e:bc39275d27"
---
## Verdict
`good to go` — EVIDENCE-GAP-ONLY: code and tests are sound; the auto capture shows Mission Control, not the touched /work board.

## Relevance
`still relevant` — the large-board perf QA, fixes and doc are new work; nothing on main already covers #1251.

## Evidence
- `default-1.png` (auto: matched src/ui-app/**, route `/`) — clean render, zero console errors, tree matches reviewed HEAD (bookkeeping-only delta), but it shows Mission Control; every changed file renders on `/work` (and `/work?status=done` at 375 px), which was never captured and had no declared shots.

## Bugs
None found

No further findings of this class were found after grepping: sortTasks callers (`BoardColumn.vue:92`, `StoryPanel.vue:170`, `repo.ts:1187`), per-comparison regex sorts (only the done path had one), identity-keeping computeds and their consumers (`heldTasks`, `humanTasks`, `MobileWorkQueue.vue` heldIds), `hiddenTaskIds` consumers (WorkView only), existing done-sort tests (`easter-eggs-0995.test.ts`, `repo-sort-order.test.ts` — semantics unchanged), runtime invocations in the diff (shebang is `bun`; `node:` imports are Bun-supported; no new bare `node`/`npm`/`npx`), and test registration (`*-browser.test.ts` vitest+WebKit is the established house pattern).

## Edge cases
- Real-device 375 px touch scroll/momentum is unmeasured (the doc says so honestly); the engineer recommends a held human task, but none is filed yet — file it before close-out.
- Done expand at 768 px measures slower on the fixed build (89→111 ms, non-overlapping ranges) — recorded as an open question; worth one look in a follow-up.
- Long idle frames (8–12 × >50 ms in 4 s) remain unisolated — open question in the doc.
- Fixture `/api/events` returns one comment then ends, so EventSource reconnects repeatedly during a run; harmless in these short sessions but could add noise to longer idle measurements.

## Suggestions
- Next UI pass on this area, declare shots for `/work` (768 or 1280) and `/work?status=done` (375) so the drawer's Changes tab shows the board the task is about.
- File the held human task for real-device scroll feel now (`repoos new ... --depends-on 1251`), as the report proposes.

## Could not verify (environment)
None.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T23:22:05.605Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

