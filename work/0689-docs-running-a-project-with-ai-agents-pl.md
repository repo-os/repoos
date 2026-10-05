---
id: "0689"
title: "Docs: 'Running a project with AI agents' playbook (user-docs page)"
type: chore
status: inbox
priority: p2
area: docs
story: "Field report: first agent-driven project run (opex)"
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T16:59:01Z"
updated_at: "2026-10-05T17:17:18Z"
---
## Problem

What it takes to drive a RepoOS project efficiently with cheap agents lives in one agent's head and a feedback log. It should be a first-class docs page so every project and every agent benefits.

## Desired UX

A new user-docs page `user-docs/running-with-agents.md` (linked from the sidebar, getting-started and the AGENTS.md template pointer) containing the text below as the starting draft (edit freely for tone, accuracy and links; verify each claim against current behaviour).

--- DRAFT START ---

# Running a project with AI agents

A practical loop for driving a RepoOS board with coding agents (yours or a team of cheap ones), learned on a real 30-task project.

## 1. Plan once, carefully

- Write tasks small (one outcome), each with Problem, Desired UX, Acceptance criteria, Notes for AI. Put real, checkable criteria in: "works at 375px", "console is clean", "tests cover X".
- Encode the order with `dependsOn`. Sequencing intelligence belongs here, at planning time. At run time "which task next" is then almost mechanical (priority, then the longest downstream chain, then age).
- Put your reference material and rules where agents will read them: an index file in `docs/`, a short block of hard rules in `AGENTS.md` that points at it, a glossary. Keep reference code and legacy material out of the build and never put real data or secrets in the repo or in task text.

## 2. Choose agents per role

- A cheap default engineer, a reviewer from a different model family, and read-only helpers (CTO, Ross) on free or small models.
- Use per-task overrides for hard tasks (set them on the task itself, then confirm the effective agent and model in the run header; some endpoints ignore override fields).
- Watch for model failure modes on long tool-heavy tasks: runaway token loops, "I'll call the tool now" without calling it, silent hangs. Restarting on a stronger model is usually cheaper than another round of fixes.

## 3. Keep the gate fast and the machine calm

- Aim for a full `repoos check` well under two minutes: small fixtures in tests, sane test timeouts, incremental typecheck.
- Run at most 2 tasks at once on a laptop. Use remote runners if you have them, and confirm they are actually used (a silent fallback to local looks identical).
- The primary checkout must stay clean: commit config and bookkeeping writes immediately, or Move to done will refuse.
- After any merge that changes the lockfile, install dependencies in the primary checkout (close-out candidates reuse its `node_modules`).

## 4. The review loop

- Read the reviewer's report, then LOOK at UI work: open the task preview, log in, check the browser console, and check at phone, tablet and desktop widths. Automated checks and LLM reviewers pass UI defects that a human sees in seconds.
- A task preview runs the branch's web code against the primary checkout's API; changes to both sides cannot be verified there until merged.
- Put feedback that must survive a change of engineer session in the task body. Messages live only in one session; the review report file is overwritten each pass.
- Approve only after you have seen it work. Approval is a human decision.

## 5. Processes and servers

- Run the server in a real terminal tab or with `repoos service`, not as a detached child of a short-lived agent shell.
- Never kill processes by name (`pkill -f vite`); you will take down other projects. Start helpers on free ports and stop only your own PID.

## 6. Money and time

- Trust provider-reported usage only. Treat estimates as unknown.
- Expect roughly an hour of wall-clock per 3 small tasks in a pipeline with review and close-out; budget more for UI work with fix rounds.
- Long chats cost more per turn because the whole history is re-read: keep a short state/handoff doc in the repo and start a fresh session at a milestone.

## 7. Close the loop

- Log every surprise as you hit it (what happened, what you did, what RepoOS could do better), with evidence. Triage the log into tasks.

--- DRAFT END ---

## Acceptance criteria

- Page added with the content above (corrected where behaviour has since changed), added to the docs sidebar and linked from getting-started, `user-docs/agents.md` and the AGENTS.md template; user-docs build passes with no broken links.
- Verify each bullet that makes a factual claim about RepoOS (overrides, review files, preview behaviour, close-out candidates). Remove or correct anything that is no longer true after related tasks land.
- `repoos check` passes.

See also: the init-flags (0670), starter-task (0671), agent-docs (0672) and docs-import (0673) tasks.

## Notes for AI

Evidence comes from building a real 30-task project (opex, a Vue + Bun + Postgres app) with cheap agents on one laptop over ~9 hours. Read `AGENTS.md` first. Never hand-edit work/*.md; use RepoOS commands or APIs. Verify any claim you rely on against the current source before changing behaviour. Where a related task exists it is listed under "See also"; coordinate rather than duplicate.

## Story context
This task is part of the story **Field report: first agent-driven project run (opex)** (story #0008, `stories/field-report-first-agent-driven-project-run-opex.md` in this repo). Read that file first: it holds the background of the run that produced this task, the facts already established for your theme (with the evidence), the decisions the owner has already made, the known uncertainties, and the list of sibling tasks you should coordinate with. Verify its facts against the current source before relying on them, and say in the task notes if you find anything in it that is wrong or out of date.

## Activity

- 2026-10-05T16:59:01Z · created · unknown
- 2026-10-05T17:05:50Z · note: Landed directly on main as an owner-authorized hotfix (commit 4c939bc2b): user-docs/running-with-agents.md, linked from the docs sidebar (Using RepoOS), getting-started 'Where to go next' and agents.md; user-docs build and 'repoos check --changed main' passed. REMAINING for this task (if kept open): (1) add the one-line pointer to the AGENTS.md template string in src/commands/init.ts, (2) re-verify each factual bullet after the related fixes land (override endpoints 0684, review history 0680, remote runners 0683, close-out install 0674) and update the page, (3) then close or delete this task. Consider closing it now if (1) is declined.
- 2026-10-05T17:17:17Z · story
- 2026-10-05T17:17:18Z · body: section Story context
