---
name: code-review
description: How to review a task's changes before signing off in RepoOS.
---

# Code review

The review gate for RepoOS tasks. A task only reaches `done` through a review —
this is how that review is performed.

## When to use

- A task is in `review` and needs sign-off.
- You want to sanity-check a task before moving it to `review`.

## Procedure

1. **Read the task file** under `work/`. Confirm the spec, acceptance
   criteria, and scope are internally consistent.
2. **Review the diff on the task's branch** (`work/<id>-*.md` frontmatter holds
   `branch`). Inspect only what this task was supposed to change — scope creep
   is a rejection reason.
3. **Run the definition of done**: `repoos check`. This must pass — build
   staleness, full build, tests, and the headless UI smoke test. A failing
   `repoos check` is an automatic request-for-changes.
4. **Check the live app**: if the task touches the UI, probe the running
   `repoos serve` in a headless browser (mounts, no unrendered `{{ mustache }}`,
   zero console errors).
5. **Decide**:
   - Changes needed → request them. The implementer fixes on the SAME branch
     and re-runs `repoos check`; it is never force-pushed.
   - Approve → say **"move task <id> to done"**. The implementer then sets
     `status: done` + activity entry, fast-forward merges to `main`, and
     deletes the branch (`git branch -d <branch>`).

## Notes

- `repoos check` is the single bar for "did this break anything?" — never
  sign off without it.
- The implementing agent never merges or self-approves its own MR.
- Only `done` goes to `main`; `review` means the branch stays open.
