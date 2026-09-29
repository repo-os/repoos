---
updated_at: "2026-09-29T21:14:20Z"
review_passes: 1
id: "0585"
title: Add Crush CLI as a drivable coding agent harness
type: feature
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-crush-cli-as-a-drivable-coding-agent
review_model_override: opencode-go/glm-5.3-flash
created_at: "2026-09-29T16:47:31Z"
---
## Problem

Crush (Charm's terminal coding agent, `github.com/charmbracelet/crush`) is not
known to RepoOS at all today — `grep -ri crush src/` returns nothing, there is
no entry in `AGENT_CLIS`, `KNOWN_AGENTS`, or the compatibility manifest, and
Crush users cannot select it on the Agents page. Every other major terminal
coding agent (opencode, Claude Code, Qwen, Codex, GitHub Copilot, Cursor, Kiro,
Antigravity) has a driver; Crush is a plausible next one.

This task is that integration. **The findings below were produced by reading
RepoOS's adapter seams and by running live probes against an installed
`crush` (v0.97.1, macOS arm64).** They are recorded so the implementing agent
does not have to rediscover them. Re-verify them against the installed binary
before relying on any of them: Crush is pre-1.0 and its `run` flags and
internal behaviour change between minors. The version a claim was measured on
is stated with each claim.

## Goal

A locally configured Crush user can select Crush as a RepoOS agent and run
engineer, reviewer, PM, and task follow-up turns in RepoOS-managed worktrees,
with live output, working cancellation, session resume, and usage in the Tokens
tab — with no regression to the existing harnesses.

## Verified seam results (v0.97.1)

RepoOS's contract suite has eight seams (`src/core/agent-contract.ts`
`ContractCapabilityId`). Crush passes six and needs two documented skips —
the same shape as Kiro, so `KIRO_CONTRACT` (`agent-contract.ts:441-461`) is the
closest precedent to copy.

| Seam | Measured behaviour | Result |
| --- | --- | --- |
| version | `crush --version` → `crush version v0.97.1`, exit 0. `parseAgentVersion` keeps `v0.97.1` → `[0, 97, 1]`. | pass |
| help | `crush --help`, `crush run --help` → exit 0. | pass |
| model-discovery | `crush models` → plain sorted `providerID/modelID` lines when stdout is not a TTY (1718 lines here). No `--json`. | pass |
| headless-one-shot | `crush run --quiet "<prompt>"` with stdin `/dev/null` and stdout redirected to a file → plain text answer, exit 0, ~5 s. Works in a linked git worktree. | pass |
| structured-events | **No machine-readable mode.** `crush run --json` and `crush run --format json` both fail with `Unknown flag`. Nothing structured on stdout: no session id, no tool events, no usage. | **skip (plain text)** |
| auto-permissions | Auto-approved by design with **no flag**: `InitCoderAgentNonInteractive` calls `Permissions.AutoApproveSession(sess.ID)` (`internal/app/app.go:384-386`, comment: "Automatically approve all permission requests for this non-interactive session"). | pass, no flag |
| session-continuation | `crush run --session <id> "<follow-up>"` resumed a prior session and answered with its state. The id is not printed — recover it post-run with `crush session list --json`. | pass, post-run capture |
| cancellation | SIGTERM kills Crush instantly **and orphans its tool subprocesses**; SIGINT cancels gracefully and reaps them. See the cancellation section. | **needs SIGINT** |

### Evidence commands (reproduce on a quiet machine)

All of these were run with stdin closed (`< /dev/null`) and stdout redirected
to a file, i.e. exactly RepoOS's `stdio: ["ignore", outFd, errFd]` shape. Total
spend for the whole probe set was a few thousandths of a dollar on a cheap
model.

```bash
crush --version                       # crush version v0.97.1
crush --help; crush run --help        # exit 0
crush models | head                   # aihubmix/AiHubmix-Phi-4-mini-reasoning ...
mkdir -p /tmp/p && cd /tmp/p && git init -q
crush run --quiet "Reply with the single word OK." < /dev/null > out.txt   # -> OK, exit 0
crush run --json "hi"                 # ERROR: Unknown flag: --json
crush --yolo run --quiet "Reply OK"   # ERROR: Unknown flag: --yolo
crush session list --json             # [{"id":"...","uuid":"...","title":"...","created":"...","modified":"..."}]
crush run --session <id> --quiet "What number did you just count up to?"   # -> resumed, answered 30
crush session show <id> --json        # full transcript + usage (see below)
```

## Findings that decide the adapter design

### 1. Output streams live, but only assistant text

`crush run` writes the assistant's text to stdout progressively. Measured for a
400-line answer: 230 → 703 → 1147 → 1492 bytes at t=9…12 s. So the live
transcript and the 90 s stall detector (`DEFAULT_STALL_TIMEOUT_MS`,
`src/server/agents.ts:499`) behave normally — this is better than a
batch-at-the-end harness.

What stdout does **not** carry: reasoning/thinking parts (the runner's stdout
was plain numbers, no reasoning), tool calls, or tool results. `runStream.handle`
in `internal/cmd/run.go` writes only assistant message content. Tool cards in
the live view are therefore unavailable; see the post-run transcript below.

`--quiet` only hides the spinner; piped output was ANSI-free either way, so the
flag is optional (pass it anyway for safety).

### 2. Permissions: unconditional auto-approve in `run` mode, and no way to opt out

`--yolo` is a **root-command-only local flag**, not a persistent one: both
`crush run --yolo` and `crush --yolo run` fail with `Unknown flag: --yolo`
(it is only accepted by the interactive TUI, i.e. bare `crush`). It is not
needed: non-interactive sessions auto-approve every permission request
(`internal/app/app.go:384-386`). Verified end to end — a prompt that wrote
`noperm.txt` succeeded and exited 0 with no TTY and no flag.

Consequences for RepoOS:

- `engineerPermissionGaps` (`agents.ts:2439-2474`) needs a `crush` case that
  returns **no gap** with a comment explaining that approval is a property of
  the mode, not a flag. Do not invent a flag the CLI rejects.
- There is **no read-only mode**. RepoOS deliberately omits the bypass flag for
  PM authoring runs (`pmCommand`, `agents.ts:3078-3162`) so that role cannot
  edit the repo; under Crush that isolation is unavailable and PM/review runs
  get full tool access. Record the tradeoff in the docs rather than pretending
  it is equivalent. (Review runs already pass `--auto` for opencode, so the
  practical delta is the PM role.)

### 3. Cancellation needs SIGINT, not SIGTERM

`internal/cmd/run.go` installs `signal.NotifyContext(ctx, os.Interrupt, os.Kill)`
— SIGINT only (SIGKILL is uncatchable). RepoOS's `stop()`
(`agents.ts:5686-5726`) sends SIGTERM and then SIGKILL after 3 s.

Measured:

- SIGTERM to a running `crush run`: the process dies immediately (no handler)
  and its bash-tool child is **orphaned** — a `sleep 120` subprocess was
  reparented to PID 1 and kept running.
- SIGINT to a running `crush run`: the process exits promptly and the tool
  child is reaped (verified: both parent and its `sleep 300` child gone).

So this engine must be cancelled with SIGINT, or the harness must be spawned in
its own process group and killed as a group. Prefer a small, general
per-engine cancel-signal (or `detached: true` + `kill(-pid)`) over a crush-only
special case, since SIGKILL-after-3 s leaves any harness's grandchildren behind.
**Do not ship the integration with SIGTERM-only cancellation.**

### 4. Session id: capture post-run from `crush session list --json`

There is no session id on stdout, so this is the Kiro pattern
(`agents.ts:6102-6148` `captureKiroSessionId`, wired into `cleanup` at
`agents.ts:5934-5936`; `agent-contract.ts:455-460` skips the
`session-continuation` seam with a note). Crush's version is stronger because
the capture command is documented as machine-readable and emits JSON:

```bash
crush session list --json
# [{"id":"855a4a3dde69a5e5","uuid":"…","title":"Counting Numbers 1 to 30","created":"…","modified":"…"}]
```

Session state is **per project directory**: `<cwd>/.crush/crush.db`, and the
list is scoped to that project. A before/after snapshot diff therefore names
exactly this run's session even with concurrent tasks — verified in a linked
worktree: before `[]` → after `[fded3580383368b3]`. Implementers should diff
snapshots rather than trust list ordering, and should **not** use
`crush run --continue` (most-recent session): a stale worktree could attach to a
different run's session, which is the same hazard cursor's driver avoids
(`agents.ts:2703-2717`).

### 5. Daemon risk: force local mode with `CRUSH_CLIENT_SERVER=0`

Crush's client/server architecture is off by default (`useClientServer()` reads
`CRUSH_CLIENT_SERVER`; unset → `setupLocalWorkspace`, one in-process foreground
process). With `CRUSH_CLIENT_SERVER=1`, `crush run` **auto-spawns a detached
`crush server`** (`ensureServer`, `internal/cmd/root.go`) — verified: a
`crush server` process was still alive after the run finished — and `runStream`
then suppresses live message events in favour of the terminal `RunComplete`
payload, so streaming degrades to one dump at the end.

RepoOS's rule is one foreground process with no daemon (`docs/agent-compatibility.md`,
opencode v2 needs `--standalone` for the same reason). The adapter must set
`CRUSH_CLIENT_SERVER=0` explicitly in the child env so a user's exported value
cannot silently turn RepoOS runs into daemon mode.

### 6. Post-run transcript and usage come free

`crush session show <id> --json` returns the whole turn in structured form:

```json
{"meta":{"id":"…","uuid":"…","title":"…","created":"…","modified":"…",
         "cost":0.0016488,"prompt_tokens":13642,"completion_tokens":3,"total_tokens":13645},
 "messages":[{"role":"assistant","model":"…","provider":"…","parts":[
   {"type":"reasoning","thinking":"…"},
   {"type":"text","text":"…"},
   {"type":"tool_call","tool_call_id":"…","name":"write","input":"{…}"},
   {"type":"tool_result","tool_call_id":"…","name":"write","content":"…"},
   {"type":"finish","reason":"tool_use"}]}]}
```

That covers the Tokens tab (map `cost` → `costUsd`, `extractUsage` source,
alongside the existing kiro-credits precedent at `agents.ts:5770-5800`) and the
persisted/History transcript with real tool cards — more than Kiro gives. The
cost field appears to be USD (0.0016488 for a trivial run); confirm before
labelling the source. If live tool cards are wanted later, poll
`crush session show --json` during the run — that is a separate, optional
follow-up, not part of this task.

Note the token profile: a **trivial** prompt measured 13,642 prompt tokens,
because Crush sends its own system prompt and tool definitions. That is normal
for this class of harness, not a bug, but it is worth a line in the docs so
nobody "fixes" it.

### 7. Model selection

`--model` / `-m` accepts `model` or `provider/model`
(`internal/cmd/run.go:170`). `crush models` emits `provider/model`, so both
ends agree. But RepoOS's static fallbacks (`AGENT_MODELS`, `config.ts:66`) are
opencode-flavoured and would be rejected — seeded/default agents for Crush must
use `model: "default"`, which omits the flag (`modelArgs`,
`agents.ts:2319-2320`). Also note `crush models` lists models for unconfigured
providers too, so the picker will show unusable entries (the `(not configured)`
label is TTY-tree-only, `internal/cmd/models.go`); filter or annotate if it
looks bad in the UI.

### 8. No `.crush` pollution, no worktree-GC interaction

Crush creates `<cwd>/.crush/` (sqlite `crush.db`, `logs/`) and writes its own
`.crush/.gitignore` containing `*` (`root.go`). Verified in a linked worktree:
`git status` stayed clean and a plain, **unforced** `git worktree remove`
succeeded — consistent with `git.ts:1734-1746` ("plain `git worktree remove`
removes a worktree holding only ignored files"). Nothing needs adding to the
repo `.gitignore`, and worktree GC needs no change.

### 9. Version line is 0.x

`supportedMajor: 0` and a narrow `supportedRange` (e.g. `>=0.97.0 <0.98.0`) is
the honest encoding, because every minor is a potential break for a pre-1.0
harness. The ladder derives "newer major" from the major digit
(`agent-compatibility.ts:337`), so 1.x reads as "newer than verified" (fine) and
anything below 0.97 reads as unsupported (hard fail for `repoos doctor`). Say so
in `upgradeGuidance` so the frequent range edits are expected rather than
alarming.

### 10. Detection details

- Binary name `crush`; install hint `brew install charmbracelet/tap/crush`
  (verified: `charmbracelet/tap/crush 0.97.1`). Official site
  <https://charm.sh/crush>. **License is FSL-1.1-MIT** (source-available,
  converts to MIT after two years) — fine for *driving* the CLI, but record it,
  since the docs treat licensing/credentials as a deliberate consideration.
- No `--json` auth-status probe exists (`crush login` / `logout` only), so use
  `authHint` and no `authCheckArgs`. With no provider configured, `crush run`
  fails with `no providers configured - please run 'crush' to set up a provider
  interactively`.
- Update checks: `agent-updates.ts:36-55` already has a HOMEBREW_FORMULAS path
  (aider, goose) — Crush belongs there.

## Where the code goes

Same seam list as every harness; `docs/agent-compatibility.md` ("Adding a
harness", lines 126-132) is the canonical checklist, and #0398 / #0406 / #0148
are the prior integration tasks to copy. Concretely:

1. `src/core/config.ts:55-64` — add `"crush"` to `AGENT_CLIS`.
2. `src/core/detect.ts:119-225` — `KNOWN_AGENTS` entry (`id: "crush"`,
   `name: "crush"`, `cli: "crush"`, `binary: "crush"`, `drivable: true`,
   install/auth hints, `capability` line).
3. `src/core/agent-compatibility.json` — contract entry, all 11 fields, starting
   `newestCertifiedVersion` / `verifiedAt` / `verificationSource` at `null`
   (honest "not yet probed"), with `requiredCapabilities` limited to
   version, help, model-discovery, headless-one-shot, auto-permissions,
   cancellation (no structured-events / session-continuation, exactly as the
   kiro contract does).
4. `user-docs/coding-harness-compatibility.md` — table row
   (`harness-compat-docs.test.ts:62-80` fails the gate without it).
5. `src/core/agent-contract.ts:567-576` — `CONTRACT_TEMPLATES` entry plus a
   `CRUSH_CONTRACT` modelled on `KIRO_CONTRACT` (`:441-461`): `version: ["--version"]`,
   `help: ["--help"]`, `models: ["models"]`,
   `run: ["run", "--quiet", prompt]`, `resume: ["run", "--quiet", "--session", id, prompt]`,
   a custom `parseRun` (plain text: `sessionId: null`, `hasAnswer` = `/OK/i`
   on the last lines), and `skipSeams` for `structured-events` and
   `session-continuation` with the reasons above.
6. `src/core/models.ts:379-398` — a real `crush` adapter parsing
   `crush models` (`provider/model` lines), and add `crush` to the stub-loop
   skip list if it gets real discovery.
7. `src/server/agents.ts` — `engineForCli` (`:981-990`), `Session.engine` union
   (`:302-311`) and the persisted-engine allowlist (`:6199-6209`),
   `DRIVABLE_CLIS` (`:2323`), `engineerPermissionGaps` (`:2439-2474`, no-flag
   case), `modelArgs`/flag builders, `cliCommand` (`:2510-2609`),
   `resumeCommand` (`:2620-2745`), `promptCommand` (`:3021-3062`), `pmCommand`
   (`:3078-3162`), `reviewCommand` (`:3187-3266`), `parseOneShotLine`
   (`:3278-3334`), an `appendLine` branch (`:4965-5015`) — the plain-text
   `{s:"out"}` fallback is sufficient — the post-run session capture (a
   crush analogue of `:6102-6148`, wired into `cleanup` at `:5934-5936`, also
   ingesting `session show --json` for usage), the cancel signal (`stop()`,
   `:5686-5726`), and `CRUSH_CLIENT_SERVER=0` in the child env at the spawn
   site (`:4826-4840`).
8. `src/core/agent-updates.ts:36-55` — homebrew formula entry.
9. UI: `src/ui-app/src/views/AgentsView.vue:150-156` `CLI_LABELS`,
   `src/ui-app/src/stores/config.ts:7-24` / `:146-167` model lists and labels.
10. `src/core/providers/spend.ts:23-34, 53-153` — a dispatch-provider row if
    Crush is meant to appear in the Tokens/dispatch views.

Registration is string-keyed and there is no cli union in `types.ts`, so
nothing else needs widening — but several tests enumerate the set and will fail
until updated: `chat-tool-rows.test.ts:803-827` (needs a `AGENT_STREAMS` entry
or the `Object.keys(...).sort()` equality fails), `driver-permissions.test.ts:18-25`,
`detect.test.ts:255-283`, `models.test.ts:105-126`, `agent-drivers.test.ts:167-186`,
`doctor.test.ts:327-347`, plus the manifest/docs tests above.

## Tests

- A fake `crush` fixture exercising the argv shapes: `run --quiet <prompt>`,
  `run --quiet --session <id> <prompt>`, `models`, `--version`, `--help`, and
  the plain-text session-id-less stream. Keep it credential-free and
  deterministic (`agent-contract.test.ts` is the pattern).
- Detection + compatibility status for a 0.x version (in-range, pre-range,
  1.x).
- Permission handling: assert Crush's engineering launch reports **no** gaps and
  carries no fabricated bypass flag.
- Cancellation: assert SIGINT (not SIGTERM) is sent for this engine, and that
  the child env contains `CRUSH_CLIENT_SERVER=0`.
- Session capture: given a before/after pair of `crush session list --json`
  payloads, the new id is selected; `--continue` is never used.
- Usage ingestion from `crush session show --json` (cost + tokens land in the
  session row with the right cost source).

## Certification (not part of the implementation, but do not fake it)

`repoos doctor --probe crush --yes` (live mode, opt-in, temp dir, the standard
contract probe), then record the evidence in `agent-compatibility.json` in the
same change — `newestCertifiedVersion`, `verifiedAt`, `verificationSource` —
only after a real passing run, and update the docs table row. Never set
evidence without a passing probe ("no undocumented optimistic version bump",
`docs/agent-compatibility.md:108-124`). If the live probe cannot run in public
CI, leave the entry pending and record the manual procedure, exactly as the
deferred canary section describes. Adding crush to
`.github/workflows/certify-harnesses.yml:39-48` is out of scope unless a
credential-free install path exists.

## Acceptance criteria

- `crush` is detected on PATH as a drivable harness with accurate install/auth
  hints and a compatibility pill that reflects the manifest (not "verified"
  until evidence exists).
- Crush can be selected for engineer, PM, reviewer, and follow-up runs; the
  mission prompt (including inlined skills and the handoff signal) reaches it
  via argv; the run happens in the task worktree; output streams live; the
  90 s stall detector is not tripped by normal runs.
- The turn can be cancelled without orphaning tool subprocesses.
- A follow-up turn resumes the same session; `--continue` is never used.
- Usage/transcript land in RepoOS (Tokens tab, persisted session).
- Runs execute as a single foreground process — no detached `crush server`
  regardless of the user's environment.
- `bun run fmt` clean, `repoos check --changed main` passes, and no other
  harness regresses. Docs touched by the change (`AGENTS.md`? `docs/agent-compatibility.md`,
  `user-docs/coding-harness-compatibility.md`) are updated in the same diff.

## Out of scope

- Live tool cards by polling `crush session show --json` (file separately if
  wanted).
- Client-server mode, MCP configuration, or per-project Crush config injection.
- A read-only/Crush-sandboxed mode for PM runs (does not exist upstream; the
  limitation goes in the docs instead).
- Certifying a specific release in CI.

## Notes for whoever picks this up

- Crush's source is the fastest way to settle a behaviour question:
  `gh api repos/charmbracelet/crush/contents/<path> --jq .content | base64 -d`.
  Files consulted for this task: `internal/cmd/run.go` (flags, `runStream`),
  `internal/cmd/root.go` (`useClientServer`, `ensureServer`, `.crush/.gitignore`),
  `internal/cmd/models.go`, `internal/app/app.go` (auto-approve),
  `internal/permission/permission.go`, `internal/cmd/run_stream_test.go`.
- A previous interactive session already ran throwaway probes; leftover
  `crushprobe`/`crushprobe2` dirs under `$TMPDIR` are unrelated to this task.
- Probe hygiene: `crush run` needs a configured provider, so live probing
  spends a little money (a trivial prompt ≈ 13.6k prompt tokens). Use a temp dir
  with `git init`, and kill any `crush server` you start.

## Activity

- 2026-09-29T16:47:31Z · created · unknown
- 2026-09-29T19:24:38Z · review_model_override
- 2026-09-29T19:24:45Z · status inbox→ready
- 2026-09-29T20:20:22Z · status ready→active, branch
- 2026-09-29T21:03:54Z · status active→review

