---
task: "1157"
pass: 8
at: "2026-11-17T22:54:23.091Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/qa-pass-use-the-repoos-web-app-on-deskto
state: ok
tree_identity: "1d40f7032:9572addbc0"
---
## Verdict
`needs some work` — the four narrow-width fixes are correct and tested; only the declared handoff captures are wrong-width. `EVIDENCE-GAP-ONLY`

## Relevance
`still relevant` — the phone-width regressions were real and no other landed task covers them; #1163–#1165 are follow-ups, not replacements.

## Evidence
- `default-1.png` (Work, "after narrow filter reflow"): captured at 1024×768 desktop, so the 390/320 reflow the label names is not shown.
- `default-2.png` (Secrets, "within the phone viewport"): 1024×768 desktop, and it renders the no-auth 401 banner rather than the authenticated picker state.
- `default-3.png` (Inputs, "byline wraps at phone width"): 1024×768 desktop; the byline is on one line, so the wrap is not shown.
- The drawer Review-toolbar and Debug-pill wrap fixes (HEAD `1d40f7032`) have no post-fix capture; the attached 320/390 drawer PNGs predate it and still show "Send engin" clipped.

## Bugs

None found
No further findings of this class were found after grepping: `.review-toolbar`, `.review-pane-tabs`, `.debug-tabs`, `.changes-tabs`, `.drawer-tabs`/`.drawer-tabs-scroll`, `.quickbar-row`/`.task-status-select`, `.mobile-queue-row`/`.mobile-status-filter`/`.mobile-sort`, `.mobile-chip-row` (intentional scroll strip), `.secrets-env-control`/`.secrets-picker-wrap`/`.secrets-picker`, `.input-row-meta`/`.detail-meta`/`.input-byline`, `.am-list-notice-text`, and the two new tests.
- Browser verification: Handoff browser verification recorded 2 blocking issue(s): [request] HTTP 401 for http://127.0.0.1:38321/api/project-environments; [request] Failed to load resource: the server responded with a status of 401 (Unauthorized)
## Edge cases
- No current-round engineering report: round 1 (`2dfde2c`) predates HEAD and says no app source changed, so the rationale does not describe this diff.
- `GET /api/project-environments` returning 401 under `just serve-noauth` is the documented, pre-existing signed-in gate (#1164); it is environmental for this diff, but it means Secrets is not verified end to end.
- Checks tab interaction is still only partly verified; #1163 has since landed separately.
- Merge-tree conflicts only on `work/1157-*.md`; the server says close-out takes main's copy.
- Drawer rows wrap globally, not per breakpoint; they only wrap when content overflows, so desktop is unchanged.

## Suggestions
- Re-capture the three declared shots with `viewportWidth: 390` and `320` so each label matches its state; add a capture of the drawer Review and Debug tabs after the wrap.
- Remove the unused `agents` read in `mobile-responsive-overflow.test.ts`; prefer computed geometry over source regex where cheap.
- The full 1440/390/320 matrix lives only in gitignored `.repoos/qa/`; attach a few more representative pages (Control, Settings, Releases) so the QA record stays checkable.

## Automated verification

- Browser console-error check (handoff evidence): **failed** — Handoff browser verification recorded 2 blocking issue(s): [request] HTTP 401 for http://127.0.0.1:38321/api/project-environments; [request] Failed to load resource: the server responded with a status of 401 (Unauthorized)
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

