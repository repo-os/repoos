---
task: "1071"
pass: 6
at: "2026-11-11T12:22:35.491Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "d498bd668:c963a9a0f"
---
Repeated review classes: this is pass 6, and the recurring class is narrow lifecycle edges in the Resend and automatic send paths. Earlier passes kept finding a guard set after an await, state written from a stale copy, and an HTTP error read as "not published". The in-flight claim is now taken before the first await, the log read sits inside the `try`, and the `finally` always releases it. The error-answer case is split out and tested. One instance of the accepted-list class is still open: if the local write keeps failing, accepted recipients are not persisted. A human should look at this recurring pattern, since it has taken five rounds.

## Verdict
`needs some work` — code is sound, but acceptance 7's status-row capture is missing and the captures are stale for HEAD d498bd668.

## Relevance
`still relevant` — nothing on main emails a team when a release is published, and this branch adds that for any project with an email provider.

## Evidence
- `default-1` (`/releases`) shows the card only in the off state ("Release emails are off"). No sent or failed status row and no Resend button appear, so acceptance 7's "email status row" is unverified. Required visual criterion, so this blocks.
- `default-2` (`/settings?tab=general&section=release-emails`) matches its route and highlight and shows the four controls. Good.
- Both captures are for tree `c963a9a0f`, but HEAD is `d498bd668`. Re-capture on the final tree. Console log is clean.
- I read the new tests but did not run them, per the brief.

## Bugs
None found

## Edge cases
- `src/server/release-email.ts` `resendReleaseEmail` catch: if the local write fails on every attempt, the catch's `recordFor` also throws, so accepted recipients are not persisted and a later Resend can mail them again. This is the documented per-recipient window, and the new test only covers a transient failure.
- `waitForPublishedRelease`: a single network blip on the first look falls back to sending at the tag straight away. That is the spec's no-network fallback, but it is an early send on a transient failure.

## Suggestions (non-blocking)
- Re-capture `/releases` after a state fixture shows a sent or failed row, with the Resend button visible.
- `src/ui-app/tests/agent-process-group.test.ts` is an unrelated flake fix riding on this branch. Split it into its own task.
- `POST /api/release/email/send` is covered only by the pre-existing blanket `under("/api/release")` exemption in `src/cli/api-route-parity.ts`, not a reasoned per-route exemption. The CLI preview is follow-up 1092.
- The changelog link assumes `CHANGELOG.md` exists at the tag. Accepted scope.

## Verdict
`needs some work` — code is sound, but acceptance 7's status-row capture is missing and the captures are stale for HEAD d498bd668.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T09:41:41.293Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

