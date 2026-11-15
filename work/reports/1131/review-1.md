---
task: "1131"
pass: 1
at: "2026-11-15T16:51:16.944Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/repoos-hub-mobile-hold-to-drag-server-re
state: ok
tree_identity: "dddc9c020:"
---
## Verdict

`good to go` — `EVIDENCE-GAP-ONLY` — Meets acceptance criteria; no Hub preview shots (expected for mobile-only work).

## Relevance

`still relevant` — Addresses post–#1127 picker UX feedback that is not solved on `main`.

## Evidence

None — handoff declared `shots: skipped` (no registered mobile Hub preview target).

## Bugs

None found

No further findings of this class were found after grepping: `mobile/src/components/ServerListView.vue`, `mobile/src/tailnet.ts`, `mobile/src/components/TailnetDiscoveryView.vue`, `mobile/src/app-state.ts`, `mobile/src/App.vue`, `src/ui-app/tests/mobile-server-list.test.ts`, `src/ui-app/tests/mobile-tailnet-discovery.test.ts`, `src/ui-app/tests/helpers.ts`.

## Edge cases

- Hold-to-release without movement lifts briefly, suppresses the following click (tested); fine on device but worth a quick feel check on the Nothing Phone.
- `fetchTailnetServers` maps an empty JSON object `{}` at 200 to `outdated` (bee’s real failure mode is 404/HTML).
- Unmount mid-drag clears listeners via `cancelPending` but does not emit `reorder` (rare navigation edge).

## Suggestions

- Nick’s device pass for haptics and hold timing after merge.
- Optional follow-up: narrow `outdated` if a newer API returns structured error JSON at 200.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

