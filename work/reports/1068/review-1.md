---
task: "1068"
pass: 1
at: "2026-11-12T18:10:13.620Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/remote-capture-follow-up-remaining-docke
state: ok
tree_identity: "392b11594:"
---
## Verdict

`needs some work` — `staleContainerCleanupCommand` can fail the health probe on transient `docker ps` errors, contradicting the documented best-effort contract.

## Relevance

`still relevant` — #1060 left provider-specific cancellation and validate.sh reaper gaps; this branch targets those directly.

## Evidence

None

## Bugs

**Probe best-effort / failure-propagation contract:** `staleContainerCleanupCommand()` (`src/server/remote-validation.ts:1198–1203`) now uses `ids=$(docker ps ...) || exit $?` and can `exit 1` on `docker rm` failure, but it is the only consumer at line 2307 inside `lines.join(" &&\n")`, where the comment at 2305–2306 still requires best-effort cleanup that must not fail the probe. A transient Docker list or remove error fails the whole prerequisite SSH script and can mark an otherwise healthy host unreachable, which is outside this task’s cancellation/watchdog scope and works against validate.sh’s guarded, continue-on-error reaper pattern.

## Edge cases

Completed-capture startup reaper now treats `docker rm` exit 0 as success without a follow-up `docker inspect` (removed in this diff); that matches common Docker semantics but is weaker than #1060’s “gone” check if the daemon lies. Engineering report `sourceSha` (`690ea3fe`) predates review lock `392b115` by docs-only commits; implementation matches the diff. Merge: only `work/1068-*.md` conflicts per landing checklist.

## Suggestions

Wrap `staleContainerCleanupCommand` in probe-local logging that never aborts the `&&` chain (mirror validate.sh’s list-and-continue pattern), or split probe cleanup from fatal prereq checks and add a test that stubbed `docker ps` failure still yields `${PREREQ_OK_TOKEN}`.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

