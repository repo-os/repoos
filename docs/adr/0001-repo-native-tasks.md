---
status: accepted
date: 2026-05-29
deciders: nick
---

# 0001 — Tasks are repo-native markdown files

## Status

Accepted.

## Context

RepoOS needs somewhere for tasks, specs, and bugs to live. The conventional
choice is an external tracker (Jira, Linear, GitHub Issues) with its own
database, accessed via API. The alternative is to store work items as files
inside the repository itself.

The forces: the system is built for AI-native workflows where agents do the
implementation. Agents already read the repo to understand code. Work items in
an external database are invisible to an agent unless it has an integration,
credentials, and network access — and even then they live apart from the code
they describe. Work items as files are versioned with the code, branchable
alongside it, reviewable in the same diff, and readable by an agent with no
integration at all.

The historical objection to files-as-tasks is that humans dislike hand-editing
structured text (YAML frontmatter), which is why external trackers won. That
objection weakens sharply when an LLM, not a human, does most of the editing.

## Decision

Tasks are markdown files with YAML frontmatter, stored under `work/` in the
repo. The files are the source of truth. No external database.

## Consequences

Positive:

- Agents read tasks the same way they read code — no integration required.
- Work is versioned, branchable, and reviewable with the codebase.
- Fully portable and offline; no service dependency.

Costs we accept:

- Cross-cutting queries (filter across hundreds of tasks) are weaker than a
  database. Mitigated by a derived index cache rebuilt from files.
- At very large task counts, parsing every file is slower than a query.
  Acceptable at the scale RepoOS targets (small expert teams).

## Related

Informs ADR-0002 (status as a frontmatter field) and ADR-0003 (self-hosting).
