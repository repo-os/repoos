---
id: "0915"
title: "repoos runners check/setup: declare which engineer CLIs each runner needs, verify installed and signed in, install missing"
type: feature
status: inbox
needs_input: true
needs_input_reason: needs-human-step
needs_input_detail: "Acceptance criteria mention a real device, physical hardware, accounts, credentials, or third-party registration — split that verification into a separate human-only task. (matched: credentials or keys)"
priority: p2
area: [server, core, web]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-22T02:26:27Z"
updated_at: "2026-10-22T02:26:31Z"
---
## Problem
Whole-engineer-sessions on runners (ADR 0009, #0913) and the existing runner pool need each runner to have the same engineer CLIs installed and signed in. Today that is checked by hand with ad-hoc ssh commands. On 2026-10-22 the state was: bee and thinkpad have opencode-go signed in; codex (ChatGPT) and cursor-agent are signed in only on thinkpad; bee has no cursor-agent and codex is not logged in; mini was not checked; opencode's own 'auth list' failed on both with 'Could not resolve npm bin'. Nothing tells a human or the scheduler which cell is wrong, and the justfile setup recipes only provision Docker and the CI image, not the engineer CLIs.

## Desired UX
Each runner host in repoos.toml can declare which engineer CLIs it should have (for example engineers = [opencode, codex, cursor]). A read-only command prints a host-by-CLI table: installed, version, signed in or not, using each CLI's own safe status command (never reading keys or token files; provider names or a yes/no only). Setup installs missing CLIs idempotently. Logging in stays a human step: the command prints the exact line to run, and can open an interactive ssh session straight into the CLI's login prompt so RepoOS never sees credentials. The result feeds the Runners tab, repoos driver brief and the capability advertisement used by #0913, and the just setup-* recipes call it.

## Acceptance criteria
- Config: per-host engineers list in [[remoteValidation.tailscaleHosts]] with a Settings control and docs (Settings-control rule in AGENTS.md).
- repoos runners check [--json]: table of host x CLI with installed / version / signed in / not signed in / unknown (with the reason, for example 'auth list failed'), exits non-zero when a declared cell is red; fakebin tests per CLI for each state.
- Safe status probes only: no key/token/secret values in output, logs, task files or the Runners tab; a test asserts a fake CLI that prints a token has it redacted.
- repoos runners setup <host>: installs missing declared CLIs idempotently (documented install method per CLI), prints the login line for any not-signed-in CLI, supports --login <cli> to open ssh -t into the CLI's login prompt; never stores credentials.
- just setup-bee / setup-thinkpad / setup-mini call runners setup (non-interactive part) after the existing provisioning; docs/remote-validation.md and user-docs updated.
- Runners tab and driver brief show red cells with the fix line; the result is reused for capability-aware placement in #0913.
- Fix or work around the opencode 'auth list' failure ('Could not resolve npm bin for opencode-ai / opencode') by probing providers without the broken command, and document how.

## Notes for AI
Start from scripts/remote-runner/*, the justfile _setup-runner recipe, src/server/remote-validation.ts host config and the runner health probe added in #0901. Related: #0907 (human setup task, depends on this), #0913 (implementation of ADR 0009), #0914 (provider usage-limit failover).

## Activity

- 2026-10-22T02:26:27Z · created · njachowski@gmail.com
- 2026-10-22T02:26:31Z · needs_input
