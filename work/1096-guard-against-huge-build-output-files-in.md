---
id: "1096"
title: Guard against huge/build-output files in WIP checkpoint commits and branch diffs
type: bug
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-11T10:29:43Z"
updated_at: "2026-11-11T10:43:57Z"
---
## Problem
On 2026-10-21 the engineer WIP checkpoint commit 5607e2aaa (#0892) staged 4,763 Xcode build files from macos/.derived-data-verify/ (~271 MB raw, ~160 MB compressed) into public history. The existing .githooks/pre-commit only runs on main and only checks format/lint, and checkpoint commits are made by RepoOS code (src/core/engineer-checkpoint-commit.ts), so nothing noticed.

The files were NOT harmless: several .xcresult Data blobs are Zstandard-compressed and, once decompressed, contain machine-wide diagnostics (process lists, memory regions, other apps' data such as Raycast clipboard history) including live Stripe restricted keys and Google API keys. GitHub secret scanning and push protection were ON and did not flag it, because they read plain text and cannot see inside compressed binaries. An outside researcher found it. So the safety net must be ours: path rules, size limits, and a content scanner that decompresses first. Purge is tracked in #1095.

## Desired UX
Large or build-output files can't silently ride a task branch into history. The checkpoint code skips and reports them; the check gate fails on them; interactive commits get a warning.

## Acceptance criteria
- The WIP checkpoint commit unstages and reports (does not commit) paths matching build-output patterns (.derived-data*, *.xcresult, DerivedData, .build) and, when the staged set exceeds a threshold (about 200 files or 5 MB), fails loudly or unstages the excess. Test with a fixture worktree.
- A new [[check.steps]] guard (like task-assets) fails when the branch diff vs main adds any file over about 1 MB or any build-output path, with an explicit allowlist for deliberate large files. Test proving it fires on a synthetic 2 MB file and an .xcresult dir.
- .githooks/pre-commit warns or blocks on staged files over the threshold on ANY branch (not just main), with a documented override. Must not block RepoOS's own commits unexpectedly.
- Thresholds are configurable in repoos.toml with a Settings UI control per AGENTS.md. Docs updated (user-docs/check.md).
- Optional: note GitHub push rulesets (file size limit) in docs.

## Notes for AI
Do not rewrite history here; that is #1095. Keep zero runtime dependencies. Mirror the task-assets guard structure.

## Activity

- 2026-11-11T10:29:43Z · created · njachowski@gmail.com
- 2026-11-11T10:43:57Z · body: Problem (added 2, removed 1)
