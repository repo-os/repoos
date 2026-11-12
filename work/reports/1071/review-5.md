---
id: review-5
title: review-5
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/release-emails-any-project-with-email-co
task: "1071"
pass: 5
at: "2026-11-11T09:43:22.049Z"
agent: reviewer
cli: claude code
model: haiku
state: ok
tree_identity: "c963a9a0f:c963a9a0f"
---
## Verdict
`needs some work`: one Resend lifecycle bug. A corrupt `release-emails.json` leaves the version stuck "in progress" until restart. Small, local fix.

## Relevance
`still relevant`: nothing on main emails a team when a release is published, and this branch adds that for any project with an email provider.

## Evidence
None. Both handoff captures match their declared routes and highlights. `default-1` shows the Release email card in the off state with Preview and the setup link. `default-2` shows the four Release emails controls. The card shows only the off state, so no sent or failed row is captured (see Suggestions).

## Bugs
- **`src/server/release-email.ts:650-654`** (class: in-flight claim taken outside its `try/finally`). `resendReleaseEmail` calls `inFlight.add(version)`, then calls `getReleaseEmailRecord` before the `try` opens. That call can throw: `readReleaseEmailLog` throws on a malformed `release-emails.json` by design, and `surfaceRecord` can throw too. The `finally` at line 681 never runs, so `version` stays in `inFlight` until the server restarts. After the file is repaired, every Resend for that version answers "An email for vX is already in progress", which is false. Fix: move the `getReleaseEmailRecord` read inside the `try`, with `accepted` declared before it, as `deliverCutReleaseEmail` does at lines 531–536. Add a test: corrupt the log, Resend throws, repair the file, second Resend is not refused as in progress.
- Sibling sweep: `inFlight` appears at lines 387, 530–531, 602, 647, 650 and 681 only. The deliver claim (531) and its read (536) are correctly ordered, and the Resend refusal check (647) is before any await. No other instance.
- Bare `node`, `npm` and `npx`: none in the added lines.

## Edge cases
- An unauthenticated GitHub 403 or 429 on the first look reads as `http-error`, so the wait runs to the hour and then reports "not on GitHub after an hour", which misdescribes a rate limit.
- `sendEmail` now gives login and invite mail a 15s abort (`email.ts`). Login mail was unbounded before. This is a sensible change but it is a behaviour change on an existing path.
- The `GET /api/release/email` read can write a bell item through the orphan path. It is idempotent.

## Suggestions (non-blocking)
- Acceptance 7: a state fixture showing a sent or failed row on the Releases card would prove the status row. Affects `default-1`.
- `POST /api/release/email/send` falls under the pre-existing blanket `under("/api/release")` exemption in `src/cli/api-route-parity.ts`. The CLI preview is already follow-up 1092.
- If the local write throws again inside the Resend catch's `recordFor`, accepted recipients are lost from disk. This is an edge of the already-fixed class.
- The Changelog link assumes `CHANGELOG.md` exists at the tag, so projects without one get a 404.
- Accepted-scope items are unchanged and not blocking.

## Could not verify (environment)
- Did not run the test suite, per the brief. The bug above was found by reading the code, not by reproducing it.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T09:41:41.293Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

