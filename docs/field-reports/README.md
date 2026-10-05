# Field reports

Evidence from running RepoOS on a **real project** the way a new user (or a team of cheap
agents) would: what happened, with error text and numbers, what the driver did about it, and
what RepoOS could do better. They are the raw material for tasks and stories.

Where they sit among the other docs:

| | What it is |
| --- | --- |
| `audits/` | A dated static review of the product or code |
| `field-reports/` (here) | A dated record of using RepoOS on a real project, with evidence |
| Incident write-ups (in `close-out-pipeline.md`, `debugging-check-failures.md`, ...) | One failure class, once understood |

## How to add one

1. Run a project end to end (an agent can drive it while the owner watches). Keep a running log
   as you go: one numbered row per surprise with severity (H blocked or wasted real time,
   M surprising or needed a workaround, L polish), area, what happened with the exact error
   text, the workaround, and a suggested fix. Record decisions and corrections too, including
   your own mistakes.
2. At the end, copy the log here as `YYYY-MM-DD-<project>-<what>.md` with a header: run summary
   (date, project, driver, work, spend, agents), a table mapping log items to RepoOS tasks, and
   the caveats (what is unverified).
3. File the triage as tasks (inbox, never ready), group them under a story named after the run,
   and add a `## Story context` pointer to each task.
4. Add a row to the index below. Do not rewrite old reports; append a short "Resolution" note
   when a task lands, or link the fixing task.

## Index

| Date | Project | Report | Story | Tasks |
| --- | --- | --- | --- | --- |
| 2026-10-05 | opex (first real agent-driven run) | [2026-10-05-opex-first-run.md](2026-10-05-opex-first-run.md) | #0008 | 0670-0692 |
