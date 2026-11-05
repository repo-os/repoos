---
id: 1038
title: Add Muse Code (Meta) coding-harness driver
type: feature
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (tagged [human]: \"Run `repoos doctor --probe muse --yes` (uses Meta credentials: `META_API_KEY` or `muse login`) and record the evidence; add Muse pairs to `[[budget.allowlist]]` in `repoos.toml`. Split this into a human task at close-out.\")"
priority: p3
area: [core, server]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
model_override: opencode-go/muse-spark-1.3-contributor
created_at: "2026-11-05T11:24:33Z"
updated_at: "2026-11-05T11:35:52Z"
---
## Problem

Muse Code (Meta's terminal coding agent, `muse` 1.4.14) is installed and logged in locally, but RepoOS has no driver for it, so it cannot be an engineer, reviewer or PM harness. Research on 2026-11-05 (CLI `--help`, public SDKs) suggests it fits the adapter contract in `docs/agent-compatibility.md`.

## Desired UX

`muse` appears as a drivable harness: detected, shown in Agents with a compatibility status, and able to run an engineer turn in a task worktree, resume it, be cancelled, and report tokens. Official certification and the budget allowlist are a separate human task (#1039) that depends on this one.

## Live runs are allowed (human-authorized 2026-11-05)

The human is logged in to Muse on this machine with a coding plan, so you MAY run `muse exec` live to answer the open questions below. Keep it small and cheap:

- At most ~10 live runs in total. Use `--model muse-spark-1.3`, `--max-model-steps 3`, and a trivial prompt that contains no project content (for example "Reply with the single word OK.").
- Run only in a throwaway temp directory (optionally `git init`'d), never in the real repo or a task worktree, and remove it afterwards.
- Use the existing login. Do NOT read, print, copy or log credentials (`~/.config/muse/auth.json`, `META_API_KEY`, `muse login` output), and do not put them in fixtures, tests, docs or the transcript.
- Do not use `--yolo`. Keep the sandbox on (`--approval-mode never`).
- Record what each live run showed (command shape, event types seen, signal behavior) in `docs/agent-compatibility.md`. These runs answer questions for the driver; they are NOT certification, so leave `verifiedAt: null`.

## Acceptance criteria

- [ai] Driver in `src/server/agents.ts` using `muse exec --json`, with a parser for the JSONL event stream. Take the real event shapes from `muse schema generate-json-schema --out <dir>` and confirm them with a live run.
- [ai] Launch flags: `--trust-workspace` (so AGENTS.md and rules load), `--approval-mode never` with the sandbox LEFT ON (not `--yolo`), `--worktree existing --worktree-existing <task worktree>` or cwd, `--max-model-steps`, and `--model`/`--reasoning-effort` from config. Options are not remembered between processes, so resend them every turn.
- [ai] Session continuation via `exec --session-id <UUID>` with an id RepoOS generates; confirm with live runs that a second `exec` with the same id really resumes, and cover the argument shape with a fake binary in tests.
- [ai] Advisory (PM/reviewer) turns use `--disable-write` and `--disable-shell` for read-only; confirm live that writes are refused.
- [ai] Cancellation: determine live which signal stops a run and reaps tool subprocesses (SIGTERM vs SIGINT, as with Crush); set `engineCancelSignal` and the contract template.
- [ai] Token usage: determine from the event schema and a live run whether tokens/cost are reported; record via the sessions table; if not, say so in the docs.
- [ai] Model discovery: there is no `muse models`; use `muse model-profile show <model>` or a fixed list (default `muse-spark-1.3`; `muse-spark-1.3-contributor` is worth listing too) and document the choice.
- [ai] Add `CONTRACT_TEMPLATES` entry, a manifest entry in `src/core/agent-compatibility.json` with `verifiedAt: null`, fixture tests in `src/ui-app/tests/agent-contract.test.ts` (credential-free, fake binary), and the user-docs table row.

## Notes for AI

- Fixtures must stay credential-free. Never paste keys into the repo.
- Muse reads AGENTS.md; keep it under 30 KB (`docs/agents-md-size.md`).
- `muse serve` (MSP session host over stdio) is a possible later transport; out of scope here.
- Worked examples to copy: Crush and OpenCode sections of `docs/agent-compatibility.md`.

## Activity

- 2026-11-05T11:24:33Z · created · njachowski@gmail.com
- 2026-11-05T11:24:33Z · needs_input
- 2026-11-05T11:24:52Z · body: Desired UX (added 1, removed 1); Acceptance criteria (added 3, removed 4); Notes for AI (added 1, removed 1)
- 2026-11-05T11:26:54Z · model_override
- 2026-11-05T11:35:52Z · body: Problem (added 1, removed 1); Desired UX (added 1, removed 1); Live runs are allowed (human-authorized 2026-11-05) (added); Acceptance criteria (added 7, removed 7)
