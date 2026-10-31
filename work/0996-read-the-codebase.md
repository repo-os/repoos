---
id: "0996"
title: Read this codebase and propose docs/ + an initial task backlog
type: spec
status: inbox
priority: p2
area: docs
assigned_to: unassigned
created_by: repoos-init
branch: ""
---
## Overview

If this repository is actually empty, close this task and use the
product-vision task instead (`repoos init --starter vision` seeds one).

RepoOS was just added to an existing codebase. The first useful move is to read
what's already here, write down what a newcomer — human or agent — would need,
then turn what's missing into work.

## What to do

1. Scan the repo: top-level structure, languages and frameworks, build and
   test commands, and any existing conventions or docs.
2. Write the durable findings into `docs/` — architecture notes and the
   conventions anyone working here must follow.
3. Draft a small starter backlog of real tasks with `repoos new "<title>"`,
   each concrete enough to work on its own.
4. Record what you wrote here, then hand this task off with
   `repoos mv <id> review` and stop — RepoOS runs the checks and moves the
   status (or `done` if there is nothing left to capture).

## Notes for AI

Read `AGENTS.md` first — it's the operating loop for this repo. Base the docs
on what the code actually does rather than what you'd expect it to; where the
repo is silent, write down the open question instead of guessing.

