---
id: "0386"
title: "MTD publish-time main-drift resync has no retry cap, unlike validate-phase retries"
type: bug
status: inbox
priority: p2
area: server
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-17T08:23:08Z"
updated_at: "2026-09-17T08:23:08Z"
---
## Problem

`processJob`'s publishing phase (`integration-orchestrator.ts:~1193`) checks
whether `main` advanced since the candidate was synced; if so, it discards
the candidate and resets the job to `syncing` to rebuild from the new main —
unconditionally, no retry counter, no cap:

```ts
if (job.baseMainSha !== currentMainSha) {
  removeWorktree(root, branch);
  this.coordinator.updateJob(job.taskId, { phase: "syncing", baseMainSha: null, candidateSha: null });
  return { ok: false, reason: "main advanced, revalidating" };
}
```

Every OTHER retry path in this same file has an explicit cap: the validate
phase's own retry is limited to 2 attempts with identical-vs-different
classification (#0216), and the merge-conflict/check-failure/handoff-signal
retries in `handoff.ts` are capped at `MAX_*_RETRY_ATTEMPTS = 2` (#0271). This
one path — discovered because it's the one publish-time hits after a conflict
repair completes — has no equivalent, so a task whose sync→validate→publish
cycle takes longer than the interval between OTHER tasks landing on main can
retry this specific loop indefinitely, never winning the race.

## Reproduction (confirmed live, twice, 2026-09-17)

- **#0376**: cycled `queued → syncing → validating → publishing → "main
  advanced, revalidating" → syncing` four times over ~11 minutes (17:11,
  17:13, 17:16, 17:18 UTC) before eventually completing on a quieter window.
- **#0382**: after an 18-minute merge-conflict repair (`scheduleMergeConflictRetry`)
  correctly completed and re-enqueued, hit the SAME loop three times in a row
  (08:16:23, 08:18:16, 08:20:12 UTC) with no sign of stopping, each cycle a
  full resync + rebuild + test run (~2 minutes) thrown away.

Both happened on an unusually busy board (many tasks landing on `main` close
together this session) — genuinely reproduces under real load, not a
hypothetical.

## Fix direction

Add the same shape of cap the other retry paths already use in this file:
count consecutive publish-time drift resets (a job-level counter, not task
frontmatter — this is purely an in-flight orchestration concern, unlike the
human-visible `merge_conflict_retry_count` etc.), and once some threshold is
hit, stop silently re-cycling. Options, not prescribed:
- Escalate the same way `persistHandoffFailure`/the exhausted-retry paths do
  — surface it as needing human attention rather than looping forever.
- Or, since this isn't really a FAILURE (the branch itself is fine, it's
  losing a race), consider a backoff/priority mechanism instead of a hard
  cap — e.g. after N consecutive drifts, hold the repo lock slightly longer
  at publish time, or briefly pause accepting new integration jobs so this
  one can finally land. Whichever approach, don't let it loop unbounded.

Coordinate with `#0385` (the sibling UX task): once this has a cap and a
give-up path, the drawer/card should show that state clearly too — "losing
the race to land on main repeatedly" is a distinct, real state a user
watching the board should be able to recognize, same as the other retry
kinds already get their own hint.

## Acceptance criteria

- [ ] The publish-time "main advanced, revalidating" resync is capped —
      verify with a test that simulates repeated drift and confirms it stops
      looping rather than cycling forever.
- [ ] Whatever happens after the cap is hit (escalation, backoff, priority
      bump) is a deliberate, tested behavior, not silence.
- [ ] No regression to the legitimate self-healing case: a task that only
      drifts once or twice before landing (the common case, per both
      reproductions above) must keep working exactly as today — this is
      about bounding the loop, not making it stricter for the normal case.
- [ ] `repoos check` passes.

## Related

- #0216 — established the validate-phase's 2-attempt cap this task mirrors
  for the publish phase.
- #0271 — established the merge-conflict/check-failure/handoff-signal retry
  caps in handoff.ts, same shape this task's fix should follow.
- #0385 — the drawer/card UX for auto-repair states; should learn this
  loop's give-up state once it exists.
- #0376, #0382 — the two live reproductions.

## Activity

- 2026-09-17T08:23:08Z · created · unknown
