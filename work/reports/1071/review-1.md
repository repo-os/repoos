---
task: "1071"
pass: 1
at: "2026-11-10T02:15:41.906Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "51dc24296:0b31574f2"
---
## Verdict
`needs some work` — pending emails can't be resent after a restart, the bell notice and Releases-page shot are missing, and send failures are swallowed silently.

## Relevance
`still relevant` — nothing on main sends release emails, and the premise that the team gets no email at release still holds.

## Evidence
None required; the verdict does not use `EVIDENCE-GAP-ONLY` because code defects exist. The missing Releases-page shot for acceptance 7 is listed under Bugs.

## Bugs
- **Stuck pending state, no recovery in the UI** (class: recovery of persisted in-flight state). `ReleasesView.vue` `canResendReleaseEmail` returns false when `record.status === "pending"`. After a restart during the publish wait, `release-emails.json` keeps `pending` forever. The card shows "Waiting for GitHub…", polls every 30s, and never offers Resend. `docs/releases.md:480-481` and the engineering report both say Resend recovers it, which is false. Fix: treat a pending record older than the publish timeout as failed on read, and offer Resend for it.
- **Bell notice missing** (class: acceptance criterion not built). Acceptance 3 requires a bell notice for provider-missing and send-failure states. Nothing reaches the attention feed from `sendAndRecord`, the timeout branch, or the skipped states. The spec does not exclude it.
- **Releases-page shot missing** (class: acceptance criterion unverified). Acceptance 7 needs a shot of the email status row and the settings control. The only capture is `/` on the default target, with no declared shots. The visual criterion is unverified.
- **Errors swallowed on the fail-closed path** (class: silent catch). `release-email.ts` `startCutReleaseEmail` uses `.catch(() => undefined)`. `getReleaseEmailRecord` in `deliverCutReleaseEmail` runs before the `try`, and `recordFor` in the catch can also throw on a malformed log. The cut then sends nothing and records nothing, with no bell or card state. `ReleasesView.vue` `loadReleaseEmail` has a silent `catch {}` too.
- **Unbounded network wait on the release path** (class: outbound fetch without timeout). `email.ts` `sendEmail` has no `AbortSignal` timeout; the probe has one at 10s. A hung Resend call keeps the record `pending` and the in-flight set occupied, so Resend returns "already in progress" until restart. The same applies to `res.text()`.
- **Untested branches** (class: special-cased handlers without tests). The `release.email.to` PATCH branch in `routes/config.ts` (empty list, invalid address) and the handlers `getReleaseEmail` and `sendReleaseEmailNow` in `routes/release.ts` have no tests. The test file only covers the renderer, the wait, deliver and resend functions, and the settings placement.

## Edge cases
- The first probe treats any non-404 error as "unavailable" and sends at the tag at once. An unauthenticated 403 rate limit (60/hour per IP) therefore defeats the `published` default.
- A private repository returns 404 on the public API, so the email waits an hour and then fails. The docs do not mention this.
- `POST /api/release/email/send` accepts a pending version before GitHub has published. Only the UI hides it.
- Settings for `[release.email]` have no effect unless `[release] enabled` is true. The description says so, but the toggle still saves.

## Suggestions
- The spec puts the setting under Releases. It lives under General → Release emails. Confirm that placement is acceptable.
- The Preview covers the "preview" half of the test-email item. A send-to-self test can be filed.
- File the bell notice, restart recovery and rich templates as follow-ups, as acceptance 8 requires.
- Re-capture on the final tree: the Releases page with a sent and a pending card, and Settings → General → Release emails.

## Verdict
`needs some work` — pending emails can't be resent after a restart, the bell notice and Releases-page shot are missing, and send failures are swallowed silently.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T02:13:10.751Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

