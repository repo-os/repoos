---
task: "1165"
pass: 1
at: "2026-11-17T21:03:43.151Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/verify-agents-authentication-error-guida
state: ok
tree_identity: "46dab9723:"
---
## Verdict
`needs some work` — verification covers the Detected tab, but the screenshot's models-refresh error, its `agent login` guidance, and two vacuous test assertions are unaddressed.

## Relevance
`still relevant` — main still renders the same raw Cursor stderr notice; nothing else has fixed the guidance inconsistency.

## Evidence
None

## Bugs
- **Class: verification-scope gap** — `src/ui-app/tests/agents-detected-loading.test.ts` and the report only exercise the Detected tab (`AgentsView.vue:513-519`). The screenshot's state is the default-agents model notice: `src/core/models.ts:185` surfaces Cursor's raw stderr, rendered by `src/ui-app/src/stores/config.ts:347`. AC1/AC2 ("reproduce…", "missing-CLI-authentication state explains the required user action") are unverified for the reported surface.
- **Class: inconsistent auth remediation guidance** — that notice says `Run 'agent login'`, while `src/core/detect.ts:194`, `src/core/runner-engineer-clis.ts:50` and `user-docs/agents.md:107` say `cursor-agent login` and warn a bare `agent` can collide. `cursorErrorHint` (`src/server/agents.ts:9079`) maps this only for run failures, not the models probe; the report's rationale relies on that uncalled path. No sibling mapping or test.
- **Class: vacuous assertions** — `hint: ""` makes `toContain(hint)` always true, so the test never asserts the hint is absent when `auth: true`; `not.toContain("RepoOS account")` checks text the UI never emits; `not.toContain("<secret>")` cannot detect credential leakage because the fixture contains no secret, contrary to the report's claim. The expected hint is duplicated from `detect.ts`, so production drift won't fail it.

No further findings of this class were found after grepping: `detectRows` status mapping, `cursorErrorHint`/`CURSOR_ERROR_HINTS`, `probeError`/`listModelSources`, `modelNoticeFor`, `model-list-states.test.ts`, `models.test.ts`, `cursor-driver.test.ts` detection cases, `user-docs/agents.md`, `runner-engineer-clis.ts` `loginCommand`.

## Edge cases
`auth: null` (probe failed or unparseable, `detect.ts:623`) falls through `detectRows` to a green "ready" badge and is untested — so the report's "unknown remains unknown" claim doesn't hold at the UI layer.

## Suggestions
Add `auth: null` coverage and assert the hint is absent in the ready case; source the expected hint from `KNOWN_AGENTS` instead of duplicating it. If raw stderr is intended for the model notice, pin that with a test and document it in the Cursor section; otherwise map auth stderr to `cursor-agent login`.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

