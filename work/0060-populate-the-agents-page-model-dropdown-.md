---
id: "0060"
title: Populate the Agents page model dropdown from opencode's live model list
type: feature
status: active
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: feat/0060-live-opencode-models
created_at: "2026-08-10T23:19:09Z"
updated_at: "2026-08-10T23:21:43Z"
---
## Activity

- 2026-08-10T23:19:09Z · created · unknown

## Problem

The Agents page model dropdown is populated from `AGENT_MODELS`
(`src/core/config.ts`), a hardcoded list of three labels — `default`, `big
pickle`, `deepseek v4` — served as `agentsMeta.models`, with a hardcoded
pretty-print mapping in `AgentsView.vue`. It never reflects what the installed
coding agent can actually run: an opencode user whose configured providers
expose other models can't pick them from the dropdown, and the model field is
rejected on save unless it's in the static list (`src/server/server.ts`).
Claude code, gemini, etc. have the same limitation but their CLIs offer no
machine-readable model list — so the fix should be per-CLI from day one rather
than a one-off for opencode.

## Desired UX

The Agents page model dropdown lists **`default` + the static fallback labels +
the live model list from opencode** (`opencode models` → `provider/model`
entries), fetched when the page loads, with a "Refresh" action that re-probes
with `--refresh`. When the probe fails or opencode isn't installed, the
dropdown degrades to the static list exactly as it does today. Selecting and
saving a dynamic model works.

## Acceptance criteria

- [ ] New `src/core/models.ts` defines a per-CLI **model-source adapter**
      interface, e.g. `{ id, cli, supported, list(opts): Promise<Result> }`,
      plus a registry keyed by `Agent.cli`. The opencode adapter is
      implemented; **claude code and the other known CLIs are present as
      `{ supported: false }` placeholders** so a future adapter is a
      one-file change (scalability, no behavior now).
- [ ] `GET /api/models` returns
      `{ byCli: { opencode: { supported, models, refreshable: true },
      "claude code": { supported: false }, ... }, at }`. Never throws or hangs:
      probe timeout, bad PATH entries, missing binary → fail-soft, mirroring
      `detectAgents` in `src/core/detect.ts`.
- [ ] The opencode adapter spawns `opencode models` (cached list) and
      `opencode models --refresh` on explicit refresh, parses `provider/model`
      lines, runs in the repo-root cwd, and always offers `default`.
- [ ] Agents page dropdown (AgentsView.vue) renders `default` + static
      `AGENT_MODELS` + live opencode models, fetched on mount, with a Refresh
      affordance; degrades to static-only when the endpoint is unavailable
      (best-effort, same pattern as the detected-agents panel).
- [ ] Save validation accepts `default` or any non-empty string — the static
      `AGENT_MODELS` check is replaced so a dynamically-selected model saves;
      `AGENT_MODELS` is retained as the fallback *suggested* list. The model
      stays a RepoOS-side label (still never forwarded to a CLI).
- [ ] Fixture tests with a fake `opencode` binary assert spawn args (with and
      without `--refresh`), line parsing, and fail-soft behavior (0042/0043
      fakebin pattern); `repoos check` passes; zero new runtime dependencies.

## Notes for AI

- **Why per-CLI adapters**: opencode exposes a real list (`opencode models
  [provider]`, `--refresh` refetches the models.dev cache). claude code has
  **no** listing command — its `/model` picker is interactive and models are
  aliases (`sonnet`/`opus`/`haiku`/`fable`) + full IDs. So: implement opencode
  now, ship claude/codex/gemini/qwen/pi as `supported: false` stubs. Do NOT
  try to parse claude's enterprise `availableModels` settings — that's a
  restriction allowlist, not availability.
- **Files to touch**: new `src/core/models.ts`; `src/server/server.ts` (route,
  `agentsMeta` still serves `AGENT_MODELS` as the fallback); `src/core/config.ts`
  (unchanged except where validation lives); `src/ui-app/src/views/AgentsView.vue`
  (the `models` computed + hardcoded label map at lines ~54–59), plus the config
  store / `types.ts` / `api.ts` to carry the fetched list.
- **Zero runtime deps**: `node:child_process`/`node:fs` only, like `detect.ts`.
  Short probe timeout (reuse the ~1.5 s ceiling pattern).
- **Don't**: don't forward the model to spawn — `promptCommand`/`cliCommand`
  deliberately keep it a label; don't wire the claude adapter; don't change the
  agent config schema (fields, validation shape) beyond relaxing the model check;
  don't autosave; don't add the model list to the task drawer.
- **Self-hosting rule**: this repo runs itself — after the UI change run
  `bun run build:ui`, keep `repoos serve` running, and probe the Agents page
  (dropdown shows live models; refresh re-probes; no-model fallback) in a
  browser before reporting done.

## Scope

- **This task**: per-CLI adapter interface + registry, opencode adapter, models
  endpoint, Agents page dropdown, save validation relaxation, tests.
- **Deferred (kiV — separate tasks)**: adapters for claude code / codex /
  gemini / qwen / pi; forwarding the model to the spawned CLI; model list in the
  task drawer or per-agent pinning beyond what exists; caching/polling the list
  server-side beyond the explicit Refresh.

## Related

- 0035 · Agents page (source of the dropdown)
- 0043 · Detect installed coding agents (the probe/fail-soft pattern to mirror)
- 0058 · Drive the gemini CLI (new CLIs should slot into this same registry)
- 0059 · Make the Save agents button unmissable (same page; keep the save bar)

## Activity

- 2026-08-10T23:21:43Z · status ready→active
