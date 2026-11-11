---
task: "1071"
pass: 4
at: "2026-11-11T08:30:34.752Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "d899fb8de:d899fb8de6"
---
## Relevance
`still relevant` — nothing on main emails a team when a release is published, and this branch adds that for any project with an email provider.

## Evidence
None. Both captures are for `d899fb8de`, and the only commit after it (`5c45a2bcd`) is report bookkeeping. `default-1` (Releases card) shows the "off" state with the setup link and the Preview button. `default-2` (Settings) shows the four Release emails controls. Both render, with no blank or error states. Acceptance 7 asks for one shot of the status row and the settings control, which is met. I did not run the test suite, per the brief.

## Bugs
- **Resend can double-send under concurrent requests** (class: in-flight guard set after an await). `resendReleaseEmail` in `src/server/release-email.ts` checks `inFlight.has(version)` and then awaits `probeRelease` before `inFlight.add(version)`. Two Resend requests (two tabs, or a retried POST) can both pass the check and both send to every outstanding recipient. This probe is new in round 4. The automatic path is correct: `deliverCutReleaseEmail` adds to `inFlight` before its first await. Fix: check and add before the probe, inside the existing `try/finally`.
- **Resend drops accepted recipients on a local write error** (class: error path discards caller-owned progress, the review-3 bug 2 pattern on the sibling path). `resendReleaseEmail` has no `catch`. If `recordFor` throws inside `sendAndRecord`, the accepted address never reaches `release-emails.json`, and the next Resend mails it again. The deliver path is fixed, and its test at `src/ui-app/tests/release-email.test.ts:357` covers only deliver. Fix: catch in resend, persist the caller-owned `sentTo` as `failed`, and add the same test with a second Resend.

Review-3 findings verified fixed: the card reloads in `pollRun`'s success branch (`ReleasesView.vue:1065`); the deliver catch uses the caller-owned `accepted` list; an orphaned `pending` surfaces to the bell via `surfaceRecord`; the docs no longer claim "never twice" without the write window.

## Edge cases
- `knownIssues` is written into the committed `release-history.json` (`writeReleaseSurfaces`), not only the record. That is operator-typed and fine, but it means the text lands in git.
- `GET /api/release/email` can write a bell item through `getReleaseEmailRecord` when it finds an orphaned `pending` record. It is a read with a side effect, but it is idempotent.
- Config-key registration is complete: all four `release.email.*` keys are in `getConfigSchema()`, the `to` patch path validates addresses, and there are no bare `node`/`npm`/`npx` invocations in the diff.

## Suggestions
- Acceptance 7 would be stronger with a state fixture that shows a sent or failed row on the Releases card (`default-1`). The off state is what's captured now.
- The CLI preview is follow-up 1092, and the send-to-self test and rich templates are filed. The accepted-scope items (the Set up link target, `[release.email] enabled` without `[release]`) are unchanged and not blocking.

## Verdict
`needs some work` — two Resend paths can send the same release email twice. Both are small and local to `resendReleaseEmail`, with a test gap on the write-error path.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T08:28:53.261Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

