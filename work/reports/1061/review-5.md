---
task: "1061"
pass: 5
at: "2026-11-08T20:54:06.762Z"
agent: reviewer
cli: codex
model: gpt-6.1-terra
branch: feat/checks-stop-repoos-bookkeeping-commits-f
state: ok
tree_identity: "3b6bb1d77:a434d494b"
---
## Relevance

still relevant — #0954 addressed cross-task bookkeeping and the task’s own Markdown file, but not the broader check windows and protections requested here.

## Evidence

None

## Bugs

- **Check lifecycle coverage:** `src/server/handoff.ts:327` acquires the lock only for the local check, after remote validation. Managed self-checks and close-out checks also lack acquisition. Bookkeeping and source edits can therefore occur during those windows.
- **Source-write protection:** `src/core/git.ts:432` adds a guarded writer with no production callers. An already-running engineer can write directly to source files; the agent-start and Git-wrapper guards do not prevent this.
- **Cross-process bookkeeping coverage:** The hook is process-local (`src/core/git.ts:394`), but `src/server/git-worker-entry.ts:82` commits through a separate worker without installing it. Those commits bypass deferral.
- **Queue concurrency and ordering:** `src/server/check-gate-lock.ts:464` and `:276` perform unsynchronized read-modify-write operations. Concurrent enqueues or holders can be lost; release and recovery clear the lock before flushing, allowing a new check to overlap the flush. Flush also commits the latest file contents for each queued entry (`:493`), so repeated writes to one file collapse into the first commit rather than being applied in order.
- **Drift reporting:** `src/core/check-gate-bookkeeping.ts:73` skips commits whose individual diff cannot be read and falls back to paths alone if listing commits fails. A source-change refusal can therefore omit the required commit subject.

## Edge cases

The round-3 report source matches the reviewed implementation tree apart from report bookkeeping. Its disclosed lifecycle, queue and source-fence limitations remain present. The supplied landing checklist reports only the task-file merge conflict, which close-out resolves.

## Suggestions

Add end-to-end tests through the actual handoff, self-check, worker and restart paths, including overlapping processes and repeated writes to the same bookkeeping file.

## Verdict

needs some work — Check coverage, source protection and durable ordered deferral remain incomplete.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

