---
id: "0043"
title: Detect installed coding agents and surface them on the Agents page
type: feature
status: review
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0043-detect-coding-agents
created_at: "2026-08-06T12:49:24Z"
updated_at: "2026-08-06T17:32:44Z"
---
## Activity

- 2026-08-06T12:49:24Z · created · unknown
- 2026-08-06T17:32:44Z · status active→review

## Problem

RepoOS drives coding agents headless (0037), streams their output (0042), and
lets the user pick a `cli` per agent on the Agents page — but it never checks
whether that CLI actually exists on the machine. A task started against a
missing CLI silently spawns nothing; against a CLI that IS installed but only
shipped as a desktop app (a real case on macOS: `github-anomalyco-opencode`
installs the Electron desktop binary as `opencode`, shadowing the real headless
CLI on PATH), `opencode run` just reopens the desktop app and exits. There is
no way to discover, from inside RepoOS, what coding agents are available,
whether they are headless-drivable, or how to install the ones that aren't.

## Desired UX

- The Agents page shows a **"Detected coding agents"** panel: one row per known
  agent CLI with a status badge — installed & headless-ready / installed but
  desktop-only / not installed — plus its binary, version, and a copyable
  install hint when missing.
- Rows clearly mark which agents RepoOS can actually drive today (opencode,
  claude) versus ones that are merely detected (qwen, codex, gemini, copilot,
  aider, goose, agy, kiro-cli, pi) and would need driver wiring.
- A "Check again" button re-probes without a server restart.
- The panel reflects the real system (PATH), not just configured agents: if
  `claude` is on PATH, the user sees it even when no agent is configured with
  `cli = "claude code"` yet.

## Scope

The work is split into phases; each phase lands independently and ends with a
green `repoos check`.

### Phase 1 — Detection engine + Agents page panel

- **Probe**: a `detectAgents()` helper resolves each known agent binary against
  PATH (`process.env.PATH` split, `access(…, X_OK)`, Windows `.cmd` handling) —
  no shelling out for existence. Capture `--version` output with a short
  timeout (e.g. 1.5 s) for version display; a probe failure must never break the
  endpoint.
- **Known agent list** (name, binary, RepoOS driver status):
  | agent | binary | drivable |
  |---|---:|---:|
  | opencode | `opencode` | yes |
  | claude code | `claude` | yes |
  | qwen code | `qwen` | no (P2) |
  | codex | `codex` | no (P2) |
  | gemini | `gemini` | no |
  | github copilot | `copilot` | no |
  | aider | `aider` | no |
  | goose | `goose` | no |
  | antigravity | `agy` | no |
  | kiro | `kiro-cli` | no |
  | pi | `pi` | no |
- **Desktop-vs-headless detection for opencode**: when the resolved binary
  lives under a macOS `.app` bundle path (e.g. `.../Contents/MacOS/…`) or the
  `--version` output is a desktop-app crash/relaunch signature, report
  `headless: false` with a hint pointing at the headless CLI install.
- **Endpoint**: `GET /api/agents/detect` → `{ agents: [{ id, name, binary,
  installed, path, version, headless, drivable, installHint }] }`.
- **UI**: a "Detected coding agents" card on the Agents page (`AgentsPage.vue`)
  rendering the rows + status badges + "Check again" button hitting the
  endpoint (best-effort; panel hides if the endpoint is unavailable).
- **Acceptance (P1)**:
  - [ ] On a machine with `claude` and a real `opencode` CLI installed, both
        appear as installed & headless-ready
  - [ ] When only the opencode desktop app shadows PATH, opencode shows as
        installed-but-not-headless with the CLI install hint
  - [ ] Missing CLIs show as not-installed with a copyable install hint
  - [ ] Probing never throws or hangs the endpoint (bad PATH entries, missing
        binaries); `repoos check` passes

### Phase 2 — Driver wiring for qwen code and codex

- Extend `AGENT_CLIS` in `src/core/config.ts` and the `cliCommand` /
  `resumeCommand` mappings in `src/server/agents.ts` so configured agents can
  run under the new CLIs. Verify exact flags during implementation and document
  them (mirror 0042's note: qwen `-p <prompt>`, `--continue`, `--resume <id>`,
  `--output-format stream-json`; codex `exec <prompt>`, resume flags TBD).
- Session resume must reuse the task's worktree cwd (0041), degrade to a fresh
  run when resume metadata is missing, and stream output exactly as 0042 does.
- **Acceptance (P2)**: a fixture E2E with fake `qwen`/`codex` binaries verifies
  spawn args, streaming, and resume args (matching the 0042 fakebin pattern);
  `repoos check` passes.

### Phase 3 — Stretch

- Show detected agents even when zero are configured, with a one-click
  "configure" action that pre-fills the agent form's `cli` field.
- Persist the detection result (or re-probe on load) so the panel is populated
  without an explicit button press on first paint.

## Notes for AI

- **Zero runtime deps**: probing is `node:fs`/`node:path` only; no `which`
  dependency. PATH search order and macOS `.app` detection must not assume a
  POSIX-only environment.
- **Don't regress the agent model**: detection is informational; the existing
  `Agent.cli` config and `resolveEngineer` must keep working unchanged. A
  detected-but-undrivable CLI never becomes the launch command.
- **Real-world case this task exists for** (macOS): `github-anomalyco-opencode`
  (mise) provides the desktop app binary as `opencode` and shadows the real
  `opencode` CLI package on PATH. The detection panel should make this visible
  instead of leaving the user confused about why Start work does nothing.
- **Test alongside**: unit tests for PATH resolution + desktop detection (temp
  PATH fixtures, fake `Contents/MacOS` trees) and the endpoint; Agents page UI
  covered by the smoke test.

## Related

- 0037 (Start/Pause + spawn) needs a present CLI to be useful; 0042 made the
  spawn observable. This task closes the loop by telling the user what is
  actually installable/drivable on their machine. 0041 (worktrees) is
  orthogonal but resume wiring in P2 must keep using the worktree cwd.

## Activity

- 2026-08-06T12:49:24Z · status inbox
- 2026-08-06T13:14:40Z · status inbox→ready
- 2026-08-06T13:15:09Z · status ready→active
- 2026-08-06T13:27:29Z · status active→ready
- 2026-08-06T17:16:32Z · status ready→active
- 2026-08-06T17:32:44Z · status active→review
