---
task: "1165"
pass: 2
at: "2026-11-17T21:47:42.918Z"
agent: reviewer
cli: opencode
model: opencode-go/deepseek-v4.1-flash
branch: feat/verify-agents-authentication-error-guida
state: ok
tree_identity: "ead6a6d04:"
---
## Verdict
`good to go` — Cursor model-probe auth errors now use canonical `cursor-agent login` guidance, discard raw stderr, and are covered from adapter to notice.

## Relevance
`still relevant` — main still forwards raw Cursor stderr into the default-agents model notice and repeats the vendor's bare `agent login`; nothing else has fixed that.

## Evidence
None

## Bugs
None found

Report source `ead6a6d` matches the reviewed source tree; the later `f1ff2be` commit adds only round-2 bookkeeping. Round-1 findings (scope gap, inconsistent guidance, vacuous assertions) are all fixed.

No further findings of this class were found after grepping: every `cursor-agent login`/`agent login` surface (`detect.ts` authHint, `runner-engineer-clis.ts`, server `CURSOR_ERROR_HINTS`, `user-docs/agents.md`, shot fixtures), all `probeError` callers/adapters, `withLastGood`/`listModelSources` cache paths, config-store `applyModelSource`/`modelNoticeFor`, and both Detected-tab auth branches.

## Edge cases
- `auth: null` (auth probe failed or unparseable) still renders the green "ready" pill in `detectRows`; an unprobeable Cursor install looks healthy. Unchanged from round 1, still untested.
- `probeError` keeps only the first non-empty stderr line, so an auth message after a leading warning line bypasses `cursorAuthErrorHint` and still surfaces raw vendor text.
- Sanitization is Cursor-only; sibling model adapters still forward raw stderr (pre-existing, out of scope here).
- The `401`/`403`/`unauthorized` patterns could over-match an unrelated diagnostic, though a realistic collision is unlikely.

## Suggestions
- Share one auth classifier between `src/core/cursor-auth.ts` and `server/agents.ts` `CURSOR_ERROR_HINTS`; the regex is now duplicated and can drift.
- Add classifier unit cases: a non-auth stderr passes through unchanged, and a multi-line auth message not on the first line is handled.
- The new `models.test.ts` fakebin's `#!/usr/bin/env node` matches the file's existing fakebin convention (sanctioned test exception); no change required.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

