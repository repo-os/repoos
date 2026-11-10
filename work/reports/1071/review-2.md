---
task: "1071"
pass: 2
at: "2026-11-10T03:36:40.143Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "b9ccacc9d:b9ccacc9d"
---
## Verdict
`needs some work` — a restart mid-send can re-mail recipients on Resend, and the probe still sends early on a 200 with a non-JSON body.

## Relevance
`still relevant` — nothing on main sends release emails, and the team still gets no mail when a release goes out.

## Evidence
None. The code defects below block sign-off. Both shots render: `default-1.png` shows the Releases email card in its "off" state with Preview, and `default-2.png` shows the Settings controls. Neither shows a sent, pending or failed state.

## Bugs
- **Per-recipient progress is persisted only after the send loop** (class: persist-after-side-effect ordering). `release-email.ts` `sendAndRecord` pushes accepted addresses into a local `sentTo` and writes once at the end via `recordFor`. A restart after recipient 1 is accepted but before the final write leaves the record as `pending` with the old `sentTo`. `getReleaseEmailRecord` then reads it as `failed` with `sentTo: []`, and Resend mails recipient 1 again. The same window exists in `resendReleaseEmail`. Fix: write `sentTo` after each accepted address, and add a test that interrupts mid-loop.
- **Transport and parse errors are conflated** (class: error classification in the probe, the same class as the 403 fix). `release-email.ts` `probeRelease` wraps `res.json()` in the `try` that maps errors to `unreachable`. A 200 with a non-JSON body from a proxy or captive portal therefore counts as "no network" on the first look, and `waitForPublishedRelease` sends at the tag immediately. Only the `fetch` call itself should be classed as unreachable.
- **Handler work outside the `try`** (class: handler throws outside try). `routes/release.ts` `getReleaseEmailPreview` calls `releaseEmailVersion`, which calls `readReleaseHistory`, before its `try`. A malformed `release-history.json` gives the router's generic 500 rather than the JSON error that `getReleaseEmail` returns.
- **Visual defect in the Settings capture** (class: clipped control label). In `default-2.png` the "Send release email" select shows "When the release is pub…" with the rest cut off.

## Edge cases
- `[release.email]` is read only when `[release] enabled` is a boolean (`core/config.ts` ~L1538). A repo with `[release.email] enabled = true` and no `[release]` block silently never sends. The Settings description says so, but the toggle still saves. This was carried over from pass 1.
- Pass-1 items verified fixed: pending-after-restart reads as failed with Resend; bell notice added and cleared; `sendEmail` has a 15s abort; the 403/429 case no longer triggers the tag fallback; the private-repo 404 is documented in `docs/releases.md:462`; the Resend route refuses a pending version in flight; the silent catches now surface errors.
- The spec asked for `repoos release email --preview`. None exists. The route is covered only by the blanket `under("/api/release")` exemption in `src/cli/api-route-parity.ts`, so `repoos api` is the only CLI path.

## Suggestions
- Placement: the spec puts the setting under Releases, but it lives under Settings → General → Release emails. Confirm that is acceptable.
- Re-capture a failed or pending card state. The current shot is labelled "with Preview and Resend", but Resend is not visible in the off state.
- The recipients placeholder reads "value1, value2". Use a real example address.
- File the send-to-self test, the CLI subcommand and the rich-template work as follow-ups, per acceptance 8.

## Verdict
`needs some work` — a restart mid-send can re-mail recipients on Resend, and the probe still sends early on a 200 with a non-JSON body.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-10T03:33:06.447Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

