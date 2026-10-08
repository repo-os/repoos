---
id: "0616"
title: Integrate pi as a drivable coding harness
type: feature
status: done
priority: p2
area: [agent, core, server]
merged_commit: bddb3b9b91ea2fff0e21e86a87c29cd9126366d8
assigned_to: ai
created_by: ""
branch: feat/integrate-pi-as-a-drivable-coding-harnes
created_at: "2026-10-01T16:34:17Z"
updated_at: "2026-10-01T18:05:39Z"
---
## Context

`pi` (`@earendil-works/pi-coding-agent`) is already a **detected** harness in
RepoOS, but not a **drivable** one:

- `src/core/detect.ts` has a `KNOWN_AGENTS` entry `{ id: "pi", binary: "pi",
drivable: false }`.
- `src/core/agent-updates.ts` maps it to its npm package for update checks.

RepoOS can therefore show that pi is installed and whether it is current, but it
cannot launch, stream, resume, or cancel a pi run. This task adds the adapter so
pi becomes a first-class engineering/reviewer/PM harness alongside OpenCode,
Claude Code, Codex, etc. (dogfooding: pi is the harness many RepoOS tasks are
worked in).

pi's own docs make this a good fit — `--mode json` is a documented, strict-JSONL
protocol (session header with an `id`, typed message/tool/usage events), so the
`structured-events` seam is stronger here than for the reverse-engineered
harnesses. See `docs/agent-compatibility.md` for the adapter-contract model and
the "Adding a harness" checklist this task follows.

## Scope

Make `pi` drivable through the same 8-seam adapter contract every other harness
uses: `version`, `help`, `model-discovery`, `headless-one-shot`,
`structured-events`, `auto-permissions`, `session-continuation`, `cancellation`.

### Known capability mapping (verify in the live probe, don't assume)

- version: `pi --version` → parseable semver.
- help: `pi --help` prints usage.
- model-discovery: `pi --list-models [search]`.
- headless one-shot: `pi --print` / `pi --mode json "<prompt>"` (one-shot, exits).
- structured-events: `--mode json` JSONL; first record is
`{"type":"session",...,"id":"<uuid>"}`; `message_update` carries cumulative
`usage` (`input`/`output`/`totalTokens`/`cost`).
- auto-permissions: pi does not prompt before every tool call
(`docs/security.md`); non-interactive runs are autonomous. Like Crush this is
a **mode property**, so encode `autoPermissions: "mode"` rather than inventing
a bypass flag. Note `-a`/`--approve` is project-trust, NOT tool approval.
- session-continuation: `pi --session <id>` / `--session-id <id>`.
- cancellation: **not documented** — determine the correct signal (SIGTERM vs
SIGINT) empirically and encode it in `engineCancelSignal`.

## Work items

1. `src/core/config.ts` — add `"pi"` to `AGENT_CLIS`; decide the model mapping
 (`AGENT_MODELS` → `--provider`/`--model`).
2. `src/core/detect.ts` — flip the entry to `drivable: true`, add `cli: "pi"`,
 capability text, and an auth probe if useful (`pi auth check --json` prints
 `ready`/`not_ready`/`invalid` with exit 0/1/2).
3. `src/server/agents.ts` — `parsePiEvent`, plus branches in `promptCommand`,
 `pmCommand`, `resumeCommand`, `engineForCli`, `engineCancelSignal`,
 `engineerPermissionGaps`, `modelArgs`, and usage/session-id extraction.
4. `src/core/agent-contract.ts` — add a `PI_CONTRACT` to `CONTRACT_TEMPLATES`.
5. `src/core/agent-compatibility.json` — add the manifest entry, starting with
 `verifiedAt: null` (honest "pending").
6. `src/ui-app/tests/agent-contract.test.ts` — deterministic fixture coverage
 proving the argument/event shapes (no credentials, no live runs).
7. `user-docs/coding-harness-compatibility.md` — add the table row (the
 `harness-compat-docs.test.ts` drift test enforces it matches the manifest).
8. Run `repoos doctor --probe pi --yes` (or `repoos certify pi --yes`) and, only
 if all seams pass, record the evidence and flip the manifest to verified.

## Acceptance criteria

- `pi` appears as a selectable, enabled harness on the Agents page and can be
assigned to engineer/reviewer/PM roles.
- A pi engineer run starts headless, streams parsed output, records a session
id, resumes that session, and cancels promptly.
- Usage/tokens (where pi reports them) land in the Tokens tab via the normal
recording path.
- `repoos check --changed main` passes.
- The docs table row and manifest agree; certification evidence recorded only
after a real passing live probe.

## Out of scope

- RPC mode integration (JSON/print mode is sufficient; note it as a possible
follow-up).
- Any change to the fixed `AGENT_MODELS` vocabulary beyond what pi's mapping
needs.

## Activity

- 2026-10-01T16:34:17Z · created · unknown
- 2026-10-01T16:51:17Z · branch
- 2026-10-01T16:51:18Z · status inbox→ready
- 2026-10-01T16:51:20Z · status ready→active
- 2026-10-01T17:13:45Z · status active→review
- 2026-10-01T18:05:39Z · status review→done, release:success
