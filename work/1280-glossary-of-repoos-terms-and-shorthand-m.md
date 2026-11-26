---
id: "1280"
title: "Glossary of RepoOS terms and shorthand (MTD, g2g, ...)"
type: feature
status: active
priority: p3
area: docs
assigned_to: ai
created_by: t@t
branch: feat/glossary-of-repoos-terms-and-shorthand-m
created_at: "2026-11-20T11:24:11Z"
updated_at: "2026-11-26T01:34:55Z"
---
## Problem
RepoOS is full of shorthand that only people who built it know. Nick used "MTD" for the Move To Done button on a task that has a green review, and "g2g" for a "good to go" review verdict. New users and agents have no place to look these terms up, so conversations drift into guessing.

## Desired UX
- A Glossary page in user-docs (and linked from the docs index and the UI help or Settings about area) listing each term with a one-line plain definition and, where it exists, the matching button, command or status name. Alphabetical, searchable in the UI if a docs viewer already exists.
- Start with the shorthand above: MTD = Move To Done (the button, `repoos done <id>`; not `repoos mv <id> done`), g2g = "good to go" review verdict. Then add every other term, status, verdict and abbreviation you come across while working in the repo: task statuses (inbox, ready, active, review, done, hold, pause), review verdicts (good to go, needs some work), needs_input, hold vs pause, driver, engineer, reviewer, CTO monitor, close-out, landable, handoff, pressureGuard, worktree, easter eggs bundle, preview, shot, gate, round and pass, narrow resolution, and any acronyms in AGENTS.md, docs/ and the UI.
- Where a term appears in the UI (a button, badge or chip), give it a styled tooltip or help popover linking to its glossary entry, using the shared tooltip component (no native title tooltips).

## Acceptance criteria
- The glossary page exists and covers at least the terms listed above, each with a definition that matches the real behavior (check the code and docs; do not guess).
- A test fails when a status or verdict name that the code defines has no glossary entry, so the glossary cannot silently go stale.
- AGENTS.md gets a one-line pointer to the glossary (keep the file under its size limit).
- Docs updated; the page works in light and dark.

## Notes for AI
Collect terms from AGENTS.md, docs/, user-docs/, the CLI help and the UI strings, and ask the human about any term whose meaning is unclear rather than inventing a definition. Nick's own shorthand (MTD, g2g) came from chat, so keep it exactly as written.

## Activity

- 2026-11-20T11:24:11Z · created · t@t
- 2026-11-26T00:09:13Z · status inbox→ready
- 2026-11-26T00:09:15Z · status ready→active, branch
- 2026-11-26T00:31:39Z · message_queued at 2026-11-26T00:31:39.048Z
- 2026-11-26T00:31:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-11-26T00:48:18Z · queued message undelivered for 17m and the engineer produced no output — ending the turn so it is delivered
- 2026-11-26T00:48:19Z · engineer turn ended without a handoff: the turn exited cleanly and did not request review · reason: ended to deliver a queued message (exit code unknown) · last assistant: The next check caught a TypeScript portability issue in the new test: this project’s NodeNext types don’t include Bun’s `import.meta.dir`. The docs build passed, but the production build stopped there; I’ll switch the test to resolve its p… · stderr: Reading additional input from stdin...
- 2026-11-26T01:05:30Z · CTO nudge: held — an undelivered message is already queued
- 2026-11-26T01:21:21Z · watchdog: check wait escalated · waiting: CPU idle is 2% (below 5%) — holding new work until the machine has idle CPU; wait exceeds the handoff deadline for 33m · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-11-26T01:34:55Z · needs_input
