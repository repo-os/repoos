---
title: Architecture Decision Records
---

# Architecture Decision Records

ADRs record a decision that shaped RepoOS, why it was made, and what it rules
out. They are immutable once accepted — if a decision changes, it gets a new
ADR, not an edit. (Process: the "Principles" section of [the vision](../vision.md).)

This table is hand-maintained — adding a new ADR means adding a row here too.

| ADR | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](0001-repo-native-tasks.md) | Tasks are repo-native markdown files | accepted | 2026-05-29 |
| [0002](0002-status-as-frontmatter.md) | Status is a frontmatter field, not a folder | accepted | 2026-05-29 |
| [0003](0003-self-hosting.md) | Self-host RepoOS on RepoOS | accepted | 2026-05-29 |
| [0004](0004-plugin-architecture.md) | Core stays minimal; project-specific integrations are plugins | accepted | 2026-06-03 |
| [0005](0005-agents-use-repoos-apis-for-privileged-operations.md) | Agents use RepoOS APIs for privileged operations | accepted | 2026-08-11 |