# Mechanical review verification

RepoOS runs two mechanical checks after the review agent produces its report and
appends a `## Automated verification` section to it (#0714). A failure CLAMPS a
reviewer's `` `good to go` `` to `needs some work`, which auto-bounces the task
back to the engineer.

Code: `src/core/review-verification.ts` (pure evaluation),
`src/server/review-verification-gather.ts` (reads the branch diff + test files),
`src/core/review-verification-config.ts` (resolved config), wired in
`src/server/review.ts` (`finalizeRun`).

## The two checks

- **Browser console errors** — only when the task's handoff browser evidence was
  required (`taskNeedsUiHandoffVerification`). Native/non-web work is skipped
  with a stated reason, never failed. Unchanged by #0762.
- **Guard negative-test evidence** — when a check *guard* was materially
  changed, a test file must show representative prohibited input is **rejected**,
  not merely that valid input passes.

## Why the guard check was narrowed (#0762)

The guard check was tied to RepoOS's own layout and misfired on other projects:

- It treated ANY added `kind =` / `name =` line in a `repoos.toml` diff as a
  "materially changed guard" whenever the diff contained a `command =` line
  anywhere. Adding a `[release]` block, a `[[distribution]]` row (rows carry
  `kind = "npm"` / `"github-release"`), a `[[shot.targets]]` row or a
  `[[preview.targets]]` row (rows carry `kind = "server"`) all counted.
- The only evidence it accepted was a test file matching
  `*.test.ts|tsx|js|mjs` that referenced the guard and showed rejection. A repo
  whose tests are Swift, Python, Go, etc. could never satisfy it.

Observed in the Divot repo (native macOS app, Swift tests): tasks #0067 (release
config) and #0081 (shot target) were each recorded `needs some work` on 4–6
consecutive passes although the reviewer's own report said `good to go` with no
bugs. The engineer could not see the `## Automated verification` section from its
sandbox, so it had to guess; the maintainer overrode by hand.

## Narrow detection

`guardsMateriallyChangedFromDiff` now derives guards only from:

- **`[[check.steps]]` rows** in the `repoos.toml` diff — an added line counts
  only when the diff's table context is inside a `check.steps` (or legacy
  `checks.steps`) array-of-tables block, and only when the added `kind` names a
  guard this build knows (`GUARD_REVIEW_MARKERS`). Table context is tracked from
  the diff's own `[[…]]` / `[…]` headers, so a row's edits are attributed to the
  block they live in and a following unrelated block cannot inherit the
  `check.steps` context.
- **`src/commands/check.ts`** — RepoOS's own guard source. That path exists only
  in this repo, so this branch is inherently RepoOS-only.

Guard *entities* that are not check-step kinds (`[release]`, `[[distribution]]`,
`[[shot.targets]]`, `[[preview.targets]]`, `[[agents]]`, …) never count.

## Configuration

`[reviewVerification]` in `repoos.toml` (Settings → General):

- `guardTestCheck` (boolean, default **on**) — the kill switch. When `false`, the
  check is skipped with a stated reason. It only ever fires for guards a project
  actually declares, so a repo with no built-in RepoOS guard in its `[[check.steps]]`
  is never blocked by it — the switch is the explicit opt-out.
- `testGlobs` (string array, default `**/*.test.ts`, `**/*.test.tsx`,
  `**/*.test.js`, `**/*.test.mjs`) — the globs identifying test files counted as
  evidence. Uses the same glob compiler as `whenChanged`
  (`src/core/check-plan.ts`), so `**/*Tests.swift`, `**/test_*.py`, `tests/**`
  and `**/*_test.go` all work.

Test files are only read when the check is on AND a guard actually changed, so
the extra glob breadth costs nothing on an unrelated diff.

## Language-agnostic rejection detection

`testContentDemonstratesGuardRejection` recognises the common assertion shapes
across languages: JS/TS `expect().toThrow()` / `.rejects`, Swift
`XCTAssertThrowsError`, Python `pytest.raises` / `assertRaises`, Go
`t.Error(f)` / `t.Fatalf`, plus generic "should/must/expect … throw|fail|raise|reject"
phrasing. A bare prose mention of "rejects" still does not count.

## The clamp reason reaches the engineer

A clamped verdict records why in two places an agent without drawer access can
read:

- the **task activity note** (`review pass N: needs some work — clamped by
  automated verification: <reason>`), visible in `repoos show`, and
- the **auto-bounce message** to the engineer, which opens with a
  `## Why this was sent back` line.

`AppliedReviewVerification.clampReason` carries the reason; `ReviewReport.clampReason`
persists it for the note and the follow-up.
