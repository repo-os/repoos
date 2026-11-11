---
task: "1071"
pass: 8
at: "2026-11-11T20:06:14.021Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/release-emails-any-project-with-email-co
state: ok
tree_identity: "e738f025d:e3665bd6e"
---
Repeated review classes: this is pass 8. The recurring classes were lifecycle edges in the Resend and automatic send paths (guards set after an await, state written from a stale copy) and HTTP error answers read as "not published". All three are fixed: the in-flight claim precedes the first await, the log read sits inside the `try`, the accepted list is caller-owned on both paths, and error answers are split from a real 404. The shot evidence gap from pass 7 is also closed. A human should still look at this pattern, since it has taken seven rounds.

## Verdict
`good to go` — no blocking defect found; the claim, accepted-list and probe fixes hold on read, and captures cover HEAD.

## Relevance
`still relevant` — nothing on main emails a team when a release is published, and this branch adds that for any project with an email provider.

## Evidence
None. All three declared captures are on HEAD `e3665bd6e`, routes matched, and the console log is clean. The sent row reads "Email sent to 2 recipients"; the failed row shows "Resend answered 422 … the domain is not verified" with Resend; the settings capture shows the four release-email controls with the section highlighted. The PNGs on disk are named `default-N.png-1.png` while the evidence JSON records `default-N.png`; they render, but the name mismatch is worth a look.

## Bugs
None found

## Edge cases
- `sendAndRecord`'s empty-targets branch overwrites a sent record's `at` and `reason` with "Already sent to every recipient". This loses an audit note (for example "Sent at the tag: GitHub could not be checked") but does not double-send.
- `probeRelease` treats any asset as published. `release.yml` creates the release and uploads the tarball in one `softprops` step, and `macos-hub.yml` adds the DMG later. The email can therefore precede the DMG and the npm publish. The spec's "with its assets" is met.
- A refused Resend leaves an on-disk `pending` record untouched. The next GET reads it as orphaned failed, which is correct.

## Suggestions (non-blocking)
- Shot 1 is labelled "with Resend", but the button is hidden once every recipient has the email, which is by design. Relabel the shot or leave it as is.
- `agent-process-group.test.ts`, `serve-reaper.test.ts` and `app-loading-skeleton.test.ts` carry unrelated flake fixes on this branch. The 6→7 section count is a legitimate consequence of the new section. The flake fixes belong in their own task.
- There is no `repoos release email --preview` command. Preview is reachable through `repoos api GET /api/release/email/preview`. `POST /api/release/email/send` sits under the blanket `under("/api/release")` UI-only exemption in `src/cli/api-route-parity.ts`; a reasoned per-route entry would be clearer.
- Accepted follow-ups, not blocking: Resend after restart probing beyond the first check; the "Set up email" link target; `[release.email]` enabled without `[release]`; the changelog link assumes `CHANGELOG.md` at the tag.

## Could not verify (environment)
- I did not re-run the test suite, per the brief. The unit and route coverage in `release-email.test.ts` looks complete on read.
- The landing checklist says "4 pass, 1 warn, 1 fail", but it lists no failing item. The count is inconsistent; the human should check it against `repoos landable 1071`.

## Verdict
`good to go` — no blocking defect found; the claim, accepted-list and probe fixes hold on read, and captures cover HEAD.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T20:02:12.949Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

