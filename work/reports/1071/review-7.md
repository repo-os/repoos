---
task: "1071"
pass: 7
at: "2026-11-11T19:40:42.491Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "e738f025d:c963a9a0f"
---
Repeated review classes: this is pass 7, and the recurring class is lifecycle edges in the Resend and automatic send paths: guards set after an await, state written from a stale copy, and HTTP errors read as "not published". All three are now fixed in code. The in-flight claim is taken before the first await, the log read sits inside the `try` so `finally` always releases the claim, and the error answer is split from a real 404 and tested. The accepted-list pattern is shared by both paths. The open item is evidence, not code: acceptance 7's status-row capture is still missing. A human should look at this pattern, since it has taken six rounds.

## Verdict
`needs some work` — code is sound; acceptance 7's sent/failed status-row captures are missing and the captures are stale for e738f025d. EVIDENCE-GAP-ONLY

## Relevance
`still relevant` — nothing on main emails a team when a release is published, and this branch adds that for any project with an email provider.

## Evidence
- Declared shot 1 (`/releases`, `state: release:emailSent`) — **missing**. Only the off-state card was captured (`default-1`: "Release emails are off… Set up release emails"). No sent row and no Resend button appear.
- Declared shot 2 (`/releases`, `state: release:emailFailed`) — **missing**. Never captured.
- Declared shot 3 (settings) — captured (`default-2`), shows the four controls. Its recorded highlight is `#settings-section-release-emails`, not the declared `[data-settings-section="release-emails"]`; the PNG shows the section outlined, but the selector mismatch should be checked.
- Both captures are for tree `c963a9a0f`; HEAD is `e738f025d`, and `default-1` header reads "from d498bd668d". Re-capture on the final tree.
- Console log is clean.

## Bugs
None found

## Edge cases
- `resendReleaseEmail` catch (`src/server/release-email.ts` ~L700): if the local write fails on every attempt, `recordFor` throws too, so accepted recipients are not persisted and a later Resend can mail them again. This is the documented per-recipient at-most-once window, not a new defect.
- `waitForPublishedRelease`: a single network failure on the first look falls back to sending at the tag. This is the spec's no-network fallback.
- The engineering report is `STALE REPORT` (source `c963a9a0f`, not the reviewed HEAD). I did not rely on its claims. Its current-round evidence is the handoff capture above.

## Suggestions (non-blocking)
- Re-capture `/releases` with `release:emailSent` and `release:emailFailed` on the final tree, showing the Resend button, so acceptance 7 is covered.
- Re-check the settings highlight selector against the declared `[data-settings-section="release-emails"]`.
- `POST /api/release/email/send` is covered only by the blanket `under("/api/release")` exemption in `src/cli/api-route-parity.ts`; a reasoned per-route entry would be clearer.
- Accepted scope, follow-up only: Resend-after-restart probe gap, the "Set up email" link target, `[release.email]` enabled without `[release]` enabled, and the changelog link assuming `CHANGELOG.md` at the tag.

## Verdict
`needs some work` — code is sound; acceptance 7's sent/failed status-row captures are missing and the captures are stale for e738f025d. EVIDENCE-GAP-ONLY

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T09:41:41.293Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

