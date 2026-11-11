---
task: "1071"
pass: 3
at: "2026-11-11T05:31:42.684Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "1c5ffda51:b9ccacc9d"
---
## Verdict
`needs some work` — the Releases email card goes stale after a cut, and a transient write error mid-send can make Resend mail recipients twice.

## Relevance
`still relevant` — nothing on main sends release emails, so the team still gets no mail when a release goes out.

## Evidence
None. The code defects below block sign-off, so this is not an evidence-only verdict. The handoff captures are for `b9ccacc9d` and are stale against HEAD `1c5ffda51`.

## Bugs
- **Email card goes stale after a cut** (class: client state not refreshed after detached work). `ReleasesView.vue` `release()` calls `loadReleaseEmail()` right after the 202, before the cut has finished. The `pollRun` success branch reloads `load()` and `loadDistribution()` but not the email state. `loadReleaseEmail` only schedules a poll when the record is already `pending`, and the detached send has not written it yet. The card shows the previous release, or "No email sent yet" with "Send now", until a reload. The server filters already-sent recipients, so this misleads rather than double-sends.
- **Error path rewrites persisted progress from a stale snapshot** (class: catch overwrites progress). `release-email.ts` `deliverCutReleaseEmail` catch writes `sentTo: existing?.sentTo ?? []`, but `sendAndRecord` has already persisted accepted addresses. If a per-recipient `recordFor` throws transiently after recipient 1 is accepted, the file is rewritten with `sentTo: []`, and Resend mails recipient 1 again. Fix: keep the accepted list in a caller-owned array and use it in the catch. Add a test that makes the second write throw.
- **Restart-interrupted sends never reach the bell** (class: state derived on read is not surfaced). `getReleaseEmailRecord` maps an orphaned `pending` to `failed` without calling `surfaceRecord`. Acceptance 3 requires the bell for send failures, so this state is missing it.
- **Docs overclaim** (class: docs versus code). `docs/releases.md` and `user-docs/configuration.md` say a restart or retried cut "never mails the team twice". Bug 2 and the window between a provider 200 and the local write contradict that. Reword to per-recipient at-most-once and state the window.

## Edge cases
- Resend after a restart skips the publish gate. An orphaned `published` record reads as `failed`, and Resend sends at once, possibly before GitHub has the release. The docs list this as a gap, but the reason text says "Resend to send the rest" with no warning. Consider reusing `probeRelease` in `resendReleaseEmail` when `when === "published"`.
- The "Set up email" link goes to `/settings?tab=security`. `src/ui-app/src` has no `emailProvider` text, so that tab may not lead to any email setup.
- `[release.email] enabled` without `[release] enabled` still saves from Settings. Only a load-time warning fires.
- Verified fixed from pass 2: per-recipient persistence in the loop, non-JSON probe handling, preview route inside `try`, shorter select labels, and the recipients placeholder.

## Suggestions
- Re-capture on the final tree. The current card shot shows only the "off" state, not the sent, pending or failed rows acceptance 7 asks for. The Settings shot predates the shortened select labels.
- `src/ui-app/tests/serve-reaper.test.ts` is an unrelated flake fix. Split it out.
- Follow-ups 1092 (CLI preview), 1093 (send-to-self test) and 1094 (rich templates) are filed, which covers acceptance 8.
- Preview shows only the plain-text body; the HTML is not viewable.

## Verdict
`needs some work` — the Releases email card goes stale after a cut, and a transient write error mid-send can make Resend mail recipients twice.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T03:33:06.447Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

