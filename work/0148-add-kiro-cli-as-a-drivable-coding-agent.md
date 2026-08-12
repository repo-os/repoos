---
id: "0148"
title: Add Kiro CLI as a drivable coding agent
type: feature
status: done
priority: p1
area: agents
assigned_to: ai
created_by: ""
branch: feat/0148-kiro-cli-agent-done
created_at: "2026-08-12T16:46:36Z"
updated_at: "2026-08-12T17:56:33Z"
---
## Problem

Kiro (`kiro-cli`) is detected on PATH and shown on the Agents page under "Detected coding agents", but `drivable` is `false` — it has no driver. Users who run Kiro as their daily AI coding tool cannot use it to execute RepoOS tasks. Every other major coding CLI (opencode, Claude Code, Qwen, Codex, GitHub Copilot) has a full driver; Kiro should be next.

## What a driver requires

Adding a new drivable agent touches four files in a fixed pattern. Reading the existing Copilot integration is the best reference because it also uses a `plain` output stream (no structured JSON events):

### 1. `src/core/detect.ts` — flip `drivable: true`

The `kiro` entry in `KNOWN_AGENTS` already exists with `drivable: false`. Change it to `true`.

### 2. `src/server/agents.ts` — five functions to update

**`engineForCli`** — add a branch returning `"kiro"` (a new engine key, see below).

**`cliCommand`** — add a `kiro` branch:
```
cmd: "kiro-cli"
args: ["chat", "--no-interactive", "--trust-all-tools", ...modelArgs("kiro", model), mission]
```
- `--no-interactive` is the headless flag (equivalent to Claude's `-p`).
- `--trust-all-tools` is **required**: stdin is ignored so no approval prompt can be answered. Without it, every file write or shell call is denied and the agent stalls.
- Model flag: `--model <model>` (same pattern as other drivers; omit when model is `"default"`).

**`resumeCommand`** — add a `kiro` branch:
```
cmd: "kiro-cli"
args: ["chat", "--no-interactive", "--trust-all-tools", ...(sessionId ? ["--resume-id", sessionId] : ["-r"]), ...modelArgs("kiro", model), text]
```
- `--resume-id <id>` resumes a specific session by UUID.
- `-r` / `--resume` resumes the most recent session in the cwd when no id is available (fallback only).

**`promptCommand`** — add a `kiro` branch:
```
cmd: "kiro-cli"
args: ["chat", "--no-interactive", "--trust-all-tools", ...extra, prompt]
```
Used by the PM/freeform agent and model-compatibility probes. No `--model` flag when using `"default"`.

**`reviewCommand`** — add a `kiro` branch:
```
cmd: "kiro-cli"
args: ["chat", "--no-interactive", "--trust-all-tools", ...extra, prompt]
```
The review agent is read-only, so the same flags suffice. `--trust-all-tools` is still needed to allow file reads without prompting.

### 3. Session `engine` — `"kiro"` plain-text engine

`kiro-cli` outputs plain text (ANSI-escaped) to **stdout** with the warning banner on **stderr**:

- **stdout**: the assistant's answer, with tool activity inline as human-readable prose (`I will run the following command: <cmd> (using tool: shell)\n<output>\n - Completed in Xs`)
- **stderr**: the trust warning banner and the credits/time footer

The existing `"plain"` engine (the default fallback path in `appendLine`) already handles exactly this shape: it stores each line as `{ s: stream, d: raw }` — plain text lines on `out`, stderr lines on `err`. There is no structured JSON to parse.

Therefore:
- Add `"kiro"` to the `Session["engine"]` union type in `agents.ts`.
- `engineForCli("kiro")` → `"kiro"`.
- `appendLine` already falls through to the plain-line path for any engine that is not `"claude"`, `"copilot"`, `"qwen"`, `"codex"`, or `"opencode"` — so the `kiro` engine is handled automatically with no new parser.
- Also add `"kiro"` to the `PersistedSession` validation array in `readPersisted` (the `includes` check on `value.engine`).

### 4. Session ID extraction

`kiro-cli` does **not** print a session ID during the run. The ID is only available after the run via `kiro-cli chat --list-sessions --format json` (run in the same `cwd` as the agent), which returns a JSON array. The most-recently-updated session is the one just completed.

After a Kiro turn exits, post-process the session list to capture the id:

```ts
// In cleanup() or immediately after spawnTurn, when engine === "kiro":
// kiro-cli chat --list-sessions --format json --session-source v2
// Parse the JSON, find the entry whose `updatedAt` is most recent, store session.sessionId.
```

The recommended approach: after the agent process closes, spawn a one-shot
`kiro-cli chat --list-sessions --format json` in the same `cwd` and parse the first
(most recent) session's `sessionId`. Store it on the session so `resumeCommand` can
use `--resume-id` on the next turn.

The JSON shape (confirmed by probing):
```json
[{ "cwd": "/path", "sessions": [{ "sessionId": "uuid", "title": "...", "updatedAt": "...", "messageCount": 4 }] }]
```

Take `[0].sessions[0].sessionId` (already sorted newest-first by the CLI).

This lookup should be best-effort (fail-soft): if the command fails or returns no sessions, `session.sessionId` stays `undefined` and the next turn falls back to `-r` (most-recent resume). The lookup must be scoped to the task's worktree `cwd` so it doesn't pick up a session from a different task running in parallel.

### 5. `src/core/models.ts` — add a kiro model source adapter

`kiro-cli chat --list-models` outputs a human-readable table. Parse it or use `--format json` if available (check during implementation):

```
Available models (* = default):
* auto                 1.00x credits      ...
  claude-sonnet-4.5    1.30x credits      ...
  ...
```

Add a `kiroAdapter`:
- Spawn `kiro-cli chat --list-models --format json` (try JSON first; fall back to plain-text parsing of the `--list-models` output).
- Return `["default", ...modelIds]`.
- Register it in `MODEL_SOURCES` as key `"kiro"`.

Plain-text parsing (fallback): split on newlines, strip the leading `*` and ANSI codes, take the first whitespace-delimited token from each model row (e.g. `auto`, `claude-sonnet-4.5`).

### 6. Credits/cost tracking — `extractUsage` in `src/server/agents.ts`

`kiro-cli` prints a footer line on **stderr** at the end of every turn:

```
 ▸ Credits: 0.15 • Time: 12s
```

This is Kiro's own billing unit (credits, not USD), but it maps naturally onto the
`costUsd` field that powers the cost readout in the task panel. Token counts are not
reported by the CLI at all — the `tokens` field will stay `null` for Kiro sessions.

Add a kiro-specific pattern to `extractUsage`:

```ts
// Kiro credits footer: " ▸ Credits: 0.15 • Time: 12s"
// Map credits → costUsd so the task panel shows the charge.
const kiroCredits = raw.match(/▸\s*Credits:\s*([\d.]+)/i);
if (kiroCredits) {
  const n = Number(kiroCredits[1]);
  if (Number.isFinite(n)) out.costUsd = n;
}
```

Place this **before** the existing text-pattern block (after the JSON parse attempt) so
it runs on every stderr line that comes through `appendLine`. The footer is emitted on
stderr; `appendLine` already processes stderr lines through `lineTouched` → `applyUsage`
→ `extractUsage`, so no extra wiring is needed — just the new pattern.

Add a corresponding test case in `src/ui-app/tests/agent-drivers.test.ts`:

```ts
it("extracts kiro credits as costUsd", () => {
  expect(extractUsage(" ▸ Credits: 0.15 • Time: 12s")).toEqual({ costUsd: 0.15 });
  expect(extractUsage(" ▸ Credits: 0.02 • Time: 2s")).toEqual({ costUsd: 0.02 });
});
```

**Important**: label the field clearly in comments so future readers know that for
kiro, `costUsd` holds credits (Kiro's billing unit), not US dollars. The value is
still useful for relative cost comparison across tasks.

### 7. `src/core/detect.ts` — update install hint

The current `installHint` for kiro is `"npm i -g kiro-cli"`. Verify this is correct (it is — `kiro-cli` is the npm package name) and leave it unchanged.

## Desired UX

- On the Agents page, Kiro appears in the "Coding agent" dropdown alongside opencode, Claude Code, etc.
- The model dropdown for Kiro is populated from `kiro-cli chat --list-models` (e.g. `auto`, `claude-sonnet-4.5`, `claude-haiku-4.5`, `deepseek-3.2`, …).
- An agent configured with `cli: "kiro"` can be started on a task: RepoOS spawns `kiro-cli chat --no-interactive --trust-all-tools [--model <m>] <mission>` in the task's worktree, streams output live on the Agent chat tab, and supports follow-up messages via `--resume-id <session-id>`.
- The handoff signal, preview signal, and all existing agent orchestration machinery work unchanged — Kiro's plain-text output is handled by the same fallback path as any unstructured CLI.

## Acceptance criteria

- [ ] `KNOWN_AGENTS` entry for kiro has `drivable: true`.
- [ ] `engineForCli("kiro")` returns `"kiro"` and `"kiro"` is in the `Session["engine"]` union and the `readPersisted` validation list.
- [ ] `cliCommand` for kiro produces `kiro-cli chat --no-interactive --trust-all-tools [--model <m>] <mission>`.
- [ ] `resumeCommand` for kiro uses `--resume-id <id>` when a session id is available, and `-r` as fallback.
- [ ] After a kiro turn exits, the session id is captured via a best-effort `--list-sessions --format json` probe and stored on the session.
- [ ] `promptCommand` and `reviewCommand` produce the correct headless kiro invocation.
- [ ] `MODEL_SOURCES["kiro"]` is registered and `kiro-cli chat --list-models` populates the dropdown.
- [ ] On the Agents page, selecting "kiro" as the coding agent shows a model dropdown with at least `default` and the live model list.
- [ ] Starting a task with the kiro agent runs `kiro-cli chat …` in the task's worktree, and output streams to the Agent chat tab in real time.
- [ ] A follow-up message resumes the correct session via `--resume-id`.
- [ ] The `▸ Credits: X` stderr footer is parsed by `extractUsage` and stored as `costUsd` on the session, so the task panel shows the Kiro credits charge.
- [ ] A test in `agent-drivers.test.ts` covers the kiro credits pattern.
- [ ] `repoos check` passes.

## Notes for AI

**Key files to touch** (in order of complexity):
1. `src/core/detect.ts` — 1-line change: `drivable: false` → `drivable: true` for the kiro entry.
2. `src/core/models.ts` — add `kiroAdapter` and register it; parse `kiro-cli chat --list-models` output.
3. `src/server/agents.ts` — add `"kiro"` to `engineForCli`, `cliCommand`, `resumeCommand`, `promptCommand`, `reviewCommand`; add post-run session-id lookup; add `"kiro"` to the `Session["engine"]` union and `readPersisted` validation; add the kiro credits pattern to `extractUsage`.
4. `src/ui-app/tests/agent-drivers.test.ts` — add a test for the kiro credits pattern in `extractUsage`.

**Do NOT** add a JSON-stream parser for Kiro — it outputs plain text. The existing `plain` fallback path handles it.

**Do NOT** pass `--json` or `--format json` to the main `chat` invocation — that flag is only valid on `--list-models` and `--list-sessions`, not on a prompt run.

**The ANSI noise**: kiro-cli emits ANSI escape codes in its output. The existing UI renders these fine (the agent chat tab already handles ANSI from other CLIs). Do not strip ANSI on the server side — let the UI handle it as it does today.

**Post-run session-id lookup** lives in the `cleanup()` method's kiro-specific branch. Spawn `kiro-cli chat --list-sessions --format json` synchronously (or as a quick async fire-and-update) in the same `cwd` as the completed turn. The JSON response is `[{ cwd, sessions: [{ sessionId, ... }] }]`; take `sessions[0].sessionId`. Fail-soft: if parsing fails, leave `sessionId` undefined.

**Model list parsing**: `kiro-cli chat --list-models --format json` — check if this flag combination exists (probe at implementation time). If not, parse the plain-text `--list-models` output: strip ANSI, split lines, match lines that start with an optional `*` then a model name (first token, no `/` required unlike opencode).

**Branch**: `feat/0148-kiro-cli-agent`

**Reference implementations** (read these):
- `src/server/agents.ts` — `copilotArgs`, `parseCopilotEvent`, the copilot branches in `cliCommand` / `resumeCommand` / `promptCommand` / `reviewCommand`.
- `src/core/models.ts` — `copilotAdapter` (simplest: no dynamic list) and `opencodeAdapter` (full dynamic list) for the kiro adapter shape.
- `src/core/detect.ts` — the full `KNOWN_AGENTS` array for how the kiro entry is structured.

## Activity

- 2026-08-12T16:46:36Z · created · unknown
- 2026-08-12T17:15:00Z · status active→review · worktree only (branch feat/0148-kiro-cli-agent)
- 2026-08-12T17:28:33Z · status active→review
- 2026-08-12T17:28:33Z · needs_merge
- 2026-08-12T17:38:59Z · status review→done, release:success
- 2026-08-12T17:56:33Z · status done→review
