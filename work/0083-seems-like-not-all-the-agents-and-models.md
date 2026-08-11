---
id: "0083"
title: Test and validate coding-agent/model combinations from the Agents page
type: feature
status: active
priority: p2
area: agent
assigned_to: ai
created_by: ""
branch: feat/0083-test-agent-model-combinations
created_at: "2026-08-11T09:10:32Z"
updated_at: "2026-08-11T09:39:00Z"
---

## Problem

The Agents page currently answers two separate discovery questions: which coding-agent
CLIs are installed, and which models OpenCode reports. It does not prove that a specific
CLI/model combination can successfully complete a headless RepoOS request. A binary may
exist but be unauthenticated, a listed model may be unavailable to the user's provider,
or the CLI may reject the model identifier or invocation flags.

There is also a deeper correctness gap: an agent's configured `model` is currently a
RepoOS-side label and is deliberately not forwarded by the start, resume, or one-shot
command builders in `src/server/agents.ts`. A green compatibility test would therefore
be misleading unless the normal execution path and the test use the same model-aware
command construction.

Users need a quick preflight from the Agents page that tests the combinations RepoOS
offers, explains failures, and prevents known-bad combinations from looking selectable.

## Desired UX

Add a **Test models** button beside **Refresh models** on the Agents page.

When clicked, RepoOS builds a deduplicated matrix from the coding agents it can actually
drive and the models currently offered for each CLI, then runs a small non-interactive
prompt for every combination. The prompt should require a tiny deterministic response
(for example, reply with exactly `REPOOS_MODEL_OK`) and must not read or modify the repo.

While the test runs:

- Show overall progress (`Testing 3 of 12…`) and a per-combination pending/running state.
- Keep the page usable, but disable starting a second test and disable Refresh models.
- Run only a small number of probes concurrently so provider rate limits and local
  resources are not flooded.

Afterward, each CLI/model combination has one of these results:

- **Passed** — the CLI exited successfully and returned the expected sentinel.
- **Failed** — launch, authentication, model resolution, non-zero exit, or unexpected
  output; show a short sanitized reason with an expandable/copyable diagnostic.
- **Timed out** — the probe exceeded its short per-combination deadline and was killed.
- **Not testable** — RepoOS has no driver/model adapter for the CLI; do not spawn it.

Failed or timed-out models remain visible for diagnosis but are greyed out and disabled
in model selectors for that CLI. Existing saved configurations using a failed model must
remain visible and editable, with a warning; RepoOS must never silently rewrite or clear
them. A **Test again** action reruns the full matrix. Results are machine-local runtime
health, not repo configuration, and do not dirty `repoos.toml` or the Agents-page save
bar.

Before any test has run, preserve today's behavior: discovery alone must not disable
models. If the test endpoint is unavailable, the Agents page degrades gracefully and
continues to show the existing model lists.

## Product rules

1. **Test the real path.** The probe and normal agent execution must share the same
   model-to-CLI argument mapping. Do not create a test-only invocation that can pass while
   Start work or freeform creation fails.
2. **Models are CLI-specific.** Only test combinations a CLI can plausibly accept.
   OpenCode's live models belong to OpenCode; do not cross-product them onto Claude Code,
   Codex, Qwen, or other CLIs without a source/adapter for that CLI.
3. **`default` is a real case.** Test it by omitting the model flag, matching normal CLI
   behavior. Explicit models use that driver's supported model argument.
4. **Fail soft.** One broken or hung combination cannot fail the whole request, crash the
   server, or prevent remaining probes from completing.
5. **No side effects.** Tests run in the repo root with an inert prompt, never in a task
   worktree, never create a task/session visible in the board, and never edit files.
6. **Do not expose secrets.** API and UI diagnostics may include exit code and bounded
   stderr/stdout, but must remove ANSI control sequences, cap output, and avoid echoing
   environment variables or credentials.

## Acceptance criteria

- [ ] The Agents page has a **Test models** button beside **Refresh models**, with overall
      progress and protection against duplicate concurrent runs.
- [ ] Testing covers every deduplicated, drivable CLI/model combination RepoOS currently
      offers for that CLI, including `default`, without creating invalid cross-CLI pairs.
- [ ] Normal start, resume, and one-shot/freeform invocations honor the configured model;
      `default` omits a model flag and explicit models use the verified flag/argument for
      OpenCode, Claude Code, Qwen Code, and Codex.
- [ ] The test uses the same shared model-aware command builder/mapping as normal agent
      execution, so a passing combination represents the command RepoOS will really run.
- [ ] Each combination resolves independently to passed, failed, timed out, or not
      testable, and the endpoint returns partial results even when some probes fail.
- [ ] A passing result requires exit code 0 and the expected sentinel response; merely
      launching the binary is not sufficient.
- [ ] Probes have a short configurable timeout, kill hung child processes, and run with
      bounded concurrency (default no more than two at once).
- [ ] Failed and timed-out combinations are visible with a concise reason and disabled in
      the matching CLI's model selector; passed combinations remain selectable.
- [ ] Changing an agent's CLI updates its model options and validation using that CLI's
      results. A saved failed model remains displayed with a warning until the user chooses
      another value.
- [ ] Test results do not alter agent config, do not trigger the unsaved-changes bar, and
      are not written to `repoos.toml` or task files.
- [ ] Before testing, after server restart, or when the endpoint fails, existing discovery
      and selector behavior remains available with no models disabled.
- [ ] Fixture tests cover argument mapping for each supported CLI, default-model omission,
      success, non-zero exit, malformed output, missing binary, timeout/kill, partial
      results, concurrency bounds, and output sanitization.
- [ ] Agents-page tests cover progress, CLI-specific filtering, disabled failed options,
      preservation of a saved failed value, rerun behavior, and fail-soft fallback.
- [ ] `repoos check` passes, including the browser smoke test.

## Implementation notes

- Introduce a shared driver-level command builder in `src/server/agents.ts` (or a focused
  adjacent module) that accepts `{ cli, model, mode, prompt, cwd, sessionId? }`. Reuse it
  from `cliCommand`, `resumeCommand`, `promptCommand`, and the compatibility probe instead
  of maintaining separate model flag logic.
- Verify exact installed-CLI syntax during implementation rather than assuming all tools
  use the same flag. Expected starting points are OpenCode `--model provider/model`,
  Claude Code `--model <alias-or-id>`, and the corresponding documented flags for Qwen
  Code and Codex. Preserve each driver's existing JSON/permission/worktree arguments.
- Extend the per-CLI model-source registry in `src/core/models.ts` so its output expresses
  which model values belong to which CLI. Unsupported sources return `supported: false`;
  they must not inherit OpenCode's live list.
- Add a server endpoint such as `POST /api/models/test`. A response should include a run
  timestamp and entries shaped roughly as `{ cli, model, status, durationMs, error? }`.
  Streaming progress may use SSE or a run-id/status endpoint; choose the smallest design
  that gives the UI live progress without holding an HTTP request indefinitely.
- Keep results in memory only for the current server process. This avoids committing
  machine-, account-, and time-specific availability into repo truth. A reload may show
  the latest in-memory run; a server restart returns to untested.
- Reuse the child-process timeout and fake-binary patterns in `src/core/models.ts`,
  `src/core/detect.ts`, and `src/ui-app/tests/agent-drivers.test.ts`. Add no runtime
  dependency.
- A test is intentionally opt-in because it may incur provider requests, token usage, and
  cost. The UI copy should say that it sends one tiny prompt per combination before the
  user starts it.
- After the UI change, run `bun run build:ui`, keep `repoos serve` running, and verify the
  Agents page in a browser as required by this repo's self-hosting rules.

## Scope

**In scope:** model-aware command construction for all currently drivable CLIs; an opt-in
compatibility-test endpoint/runner; CLI-specific model matrices; progress and results on
the Agents page; disabling combinations proven bad in the current server session; tests.

**Out of scope:** automatically running paid probes on page load; testing every known but
undrivable CLI; benchmarking model quality, latency, or cost; persisting health results to
git/config; automatically changing an agent's saved model; provider credential setup;
continuous background health checks.

## Related

- #0035 — Agents page and persisted role configuration
- #0043 — installed/headless coding-agent detection and fail-soft probing
- #0058 — Gemini driver work; future drivers should join the same test registry
- #0060 — per-CLI model-source registry and OpenCode live model discovery
- #0064 — per-task agent/model overrides; its selectors should eventually consume the
  same CLI-specific compatibility state

## Activity

- 2026-08-11T09:10:32Z · created · unknown
- 2026-08-11T09:33:31Z · spec fleshed out: shared model-aware execution, opt-in
  compatibility matrix, failure UX, safety boundaries, and test coverage · ai
- 2026-08-11T09:33:31Z · status draft→ready · ai
- 2026-08-11T09:39:00Z · status ready→active · ai
