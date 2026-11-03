# Engineering and review reports

RepoOS stores the history of one engineer → review loop side by side under
`work/reports/<task-id>/`:

- `round-<n>.json` — one immutable engineering report per successful engineer
  handoff.
- `review-<n>.md` — the numbered review report for each review pass.

Both travel with the task branch and remain in the repository after close-out,
so a fresh clone keeps the rationale and the review findings for every round.
The engineering report was originally written to
`work/engineering-reports/<task-id>/round-<n>.json`; RepoOS still reads that
legacy location, but every new report goes to the shared directory.

An engineering report is written once per handoff. A later fix after review
feedback creates another numbered round; it never overwrites an earlier round,
even when the new round did not change source files. Only a retry of an
interrupted handoff reuses the report already written for that attempt. Review
reports are appended per pass the same way and are committed by the server as
task bookkeeping, so committing one does not invalidate the review lock or the
handoff snapshot.

The engineer writes a draft under the worktree's configured cache directory
(`.repoos` by default) at `<cacheDir>/engineering-report-drafts/<task-id>.md`.
RepoOS finalizes it only after
the handoff check passes and confirms that the checked source commit has not
changed. A missing draft blocks every new handoff; work already handed off before
reports were introduced remains reviewable without one. A draft over 1,000
words or missing a required section blocks that handoff with an actionable error;
shorten or complete the draft and hand off again. Aim for 500–600 words.

Required narrative sections, in order, with nothing before the first heading:

1. `## TL;DR`
2. `## Work and rationale`
3. `## Approaches tried`
4. `## Challenges and blockers`
5. `## Key learnings`

The server appends `## Generated change summary`, computed from the round's base
and checked source commit using Git rename detection. The first round diffs from
the branch merge-base; later rounds diff from the previous round's source tree,
so a round summary describes only that round instead of replaying earlier work.
If a rebase or reset removes that source commit from the branch's history,
RepoOS cannot compute a round-relative base and refuses the handoff instead of
quietly producing a cumulative summary. Engineering and review report files and
the task's own markdown are excluded from the generated list.
It includes changed paths, status, and deterministic additions/deletions;
engineers must not author those counts. Report metadata records round, time, coding agent, model, branch, base
tree, and checked source commit. Review prompts include the newest report and
ask reviewers to consider the rationale, experiments, and stated limitations.
The Dev tab's Report view lists rounds and opens the selected report. If a stored
round cannot be read, the Report view and the reviewer prompt show the error
instead of quietly hiding that round or presenting an older one as current.
