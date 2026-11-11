---
task: "1085"
pass: 6
at: "2026-11-11T01:43:42.323Z"
agent: reviewer
cli: claude code
model: haiku
branch: feat/stale-handoff-running-validate-record-ou
state: ok
tree_identity: "894bcc1e2:dcd41847f"
---
Repeated review classes: Passes 2–5 kept finding one lifecycle class: the handoff-slot claim and the checkpoint marker. The failures were a claim taken after a check, a claim result that was ignored, a claim that leaked before its `try`, and a pending `review` marker dropped before a refusal. Round 6 fixes all four, and the new tests cover them. The optional-dependency class (`runner?.`, `reviews?.read`) is partly fixed: `runner` is now required, but the `?.` calls remain. The stale-flag renderer class is fixed on the card, drawer, pipeline and shared status line. A human should still look at the pattern: five passes on one claim/marker design suggests the design is hard to get right in one pass.

## Verdict
good to go — pass-5 claim, marker and merge issues are fixed; no blocking defects remain.

## Relevance
still relevant — `main`'s `handoff-status.ts` still has no reconcile, so a `running` record still outlives its process there.

## Evidence
None. Both captures match their declared state on the `default` target with `routeMatched: true`. Shot 1 shows `Checks · step 4 of 8 · tests 24/72 · 45m 00s · stale` on the highlighted line. Shot 2 shows `REVIEW PASSED · READY TO FINISH` with Move to done enabled. The captures are from `dcd41847f`. HEAD differs only by `work/` bookkeeping, so they are not stale. The stale-running state itself is not captured, which the accepted scope allows.

## Bugs
None found

I traced the claim-first ordering at every `markHandoffInFlight` site (`server.ts:3141`, recovery, and the runner path), and `beginHandoffStatus` only runs inside a held slot. I also checked the card, drawer, pipeline, store and server Move to done guard, and none treats a stale record as blocking.

## Edge cases
- The landing summary says "1 fail" but lists only PASS and WARN items. I ran one read-only `git merge-tree`, which shows only `work/1085-…md` conflicting, so the fail is unexplained. Ask the server which item failed before landing.
- A live finalization superseded by a newer review stays live. The card shows READY with Move to done enabled, but the server refuses on the live slot, and step/progress updates stop because they require `running`. This is accepted scope.
- `writeHandoffStatus` is best-effort. A failed supersede returns `superseded` while disk still says `running`, and the next read flips it back.
- `status → review` is set (`handoff.ts` ~1254) before `finishHandoffStatus`. A review completing in that gap would supersede a live handoff, which `passed` then overwrites. The window is narrow.

## Suggestions (non-blocking)
- `post-handoff-checkpoint-recovery.ts:152,166,186,252`: call `runner` methods directly. A test stub missing a method currently skips the claim silently. Round-5 suggestion, still open.
- Repeated: the card's slot-age check uses `CHECK_WAIT_STALLED_MS` (30 min) while the handoff flag uses `HANDOFF_DEADLINE_MS`. With `REPOOS_HANDOFF_DEADLINE_MS` above 30 min, a live handoff with no local slot is unflagged until the deadline. Derive both from one value.
- Add a test for `writeRecovery` throwing after the claim, which is the leak path.
- Accepted scope, quoted and not blocking: "beginHandoffStatus restarting a superseded attemptKey", "GET persisting superseded", "optional reviews dependency in the watchdog", "a review marker with no running review restarting the gate".

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-11T01:37:13.097Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

