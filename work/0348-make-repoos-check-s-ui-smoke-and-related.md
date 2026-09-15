---
id: "0348"
title: Make repoos check's ui-smoke (and related steps) per-project opt-in instead of RepoOS-only
type: feature
status: review
priority: p2
area: server
assigned_to: ai
created_by: ""
branch: feat/make-repoos-check-s-ui-smoke-and-related
model_override: openrouter/deepseek/deepseek-v4.1-flash
review_model_override: opencode-go/hy3
created_at: "2026-09-15T07:46:52Z"
updated_at: "2026-09-15T09:29:53Z"
review_passes: 1
handoff_signal_retry_count: 1
---
## Problem

`repoos check`'s `ui-smoke` step (`runUISmokeTest()` in `src/commands/check.ts`,
via `startPreviewServer()` in `src/commands/ui-harness.ts`) always boots
**RepoOS's own control-plane dashboard** (`startServer` from
`src/server/server.js`) and asserts things specific to it: page title is
exactly `"RepoOS"`, `.nav-item`/`.board`/`.new-btn` exist, a Tailwind v4
`css-layers` spacing invariant holds, etc. This is correct when RepoOS is
checking *itself* (self-hosting), but `check` is the generic definition-of-
done gate run by every managed project (see AGENTS.md's Definition of Done).
For a project like squishy — no board UI, possibly no UI at all yet — this
step can never meaningfully pass or fail on anything about squishy; it either
times out for infrastructure reasons (as happened in #0345, where it browsed
port contention on a machine running 3 concurrent `repoos serve` instances)
or silently "passes" by testing RepoOS's dashboard instead of the project's
own app. Either way the step is not doing its job for anyone but RepoOS
itself, and a project's real UI never gets smoke-tested through this path.

Discovered while diagnosing #0345 (squishy's first Move-to-Done). See also
the sibling fix in #0345 for `check failed: the candidate's own
dist/cli/index.js was not used (CLI-selection regression...)` — same root
cause category (RepoOS-self-hosting assumptions leaking into the generic
per-project gate), different symptom.

## Decisions from PM interview (2026-09-15)

- **Opt-in, not required.** `ui-smoke` should skip by default for a project
  that hasn't declared one — same pattern `check` already uses for
  `lockfile-sync`/`fmt:check`/`lint`/`tests` when the relevant script/config
  is absent (`✔ ui-smoke — skipped — no smoke command configured`). Do NOT
  invent a generic "boot whatever dev server we can find" fallback, and do
  NOT hard-fail projects that have a `apps/web` but no declared smoke
  command — that's a real regression risk for every project not yet at that
  stage of maturity.
- **Declaration mechanism: both, config wins.** A project can define a smoke
  command as a `package.json` script using a well-known name (mirror
  whatever convention `build`/`tests`/`lint` detection already uses — check
  `src/commands/check.ts` for the exact script-name pattern before picking a
  new one) as a zero-config default. `repoos.toml` gets a `[check]` section
  (e.g. `checks.uiSmoke = "bun run smoke"`) that overrides the package.json
  script when both are present. Same override precedence should apply to any
  other step this task ends up making pluggable.
- **Must be additive.** No currently-passing project may start failing
  `check` because of this change. A project with no smoke command configured
  gets a clean skip, not a failure. RepoOS's own repo is the only project
  that should keep running today's exact ui-smoke assertions — do this either
  by special-casing RepoOS's own repo in code (simplest, but keeps one
  RepoOS-specific path alive) or by having RepoOS's own `repoos.toml`/
  `package.json` declare its existing smoke test through the new mechanism
  (more consistent — prefer this if it doesn't meaningfully complicate the
  implementation, since it proves the mechanism works by dogfooding it on day
  one instead of leaving a permanent special case).

## Scope: audit the other check steps, but don't fix them all here

Same interview flagged these as worth checking for the same
"RepoOS-only-assumptions-leaking-into-generic-gate" problem. Audit each one
as part of this task (confirm whether it's actually generic or secretly
RepoOS-specific) and record findings in this task's body or Related section
before closing it out. Only fix in-place if trivial; otherwise spin out a
follow-up task per finding rather than growing this one unboundedly:

- `css-layers` / `theme-contrast` (Tailwind v4 layering + theme-token
  checks) — currently skip gracefully when no Tailwind v4 `style.css` /
  theme tokens are found. Confirm the skip condition is genuinely generic
  and doesn't assume RepoOS's own token names when it DOES run.
- `bare-require` / `task-assets` / `lockfile-sync` — look generic (git repo
  hygiene, task-file asset guard, lockfile presence) but confirm none of
  them assume RepoOS's own directory layout beyond the already-configurable
  `workDir`/`docsDir`/etc. in `repoos.toml`.
- The `dist/.build-info.json` staleness/build-info marker check
  (`checkBuildForRoot` in `src/core/build.ts`) — confirm what "staleness"
  means for a project with no `dist/cli` at all (e.g. squishy). If the
  marker system is implicitly CLI-shaped, either confirm it degrades
  sensibly for non-CLI projects or scope a fix.

## Acceptance criteria

- [ ] `ui-smoke` skips cleanly (`✔ ui-smoke — skipped — no smoke command
      configured`, or similar wording matching the existing skip-message
      style) for a project with no smoke command declared.
- [ ] A project can declare a smoke command via a `package.json` script
      (well-known name, matching existing script-detection conventions) and
      have `check` run it instead of RepoOS's own dashboard assertions.
- [ ] `repoos.toml`'s `[check]` section can override the package.json
      declaration when both are present.
- [ ] RepoOS's own repo still gets its existing ui-smoke coverage (board
      renders, no console errors, css-layers spacing invariant, etc.) —
      whether via special-case or by dogfooding the new declaration
      mechanism, per the note above.
- [ ] No previously-passing project's `repoos check` newly fails because of
      this change.
- [ ] Audit findings for `css-layers`/`theme-contrast`,
      `bare-require`/`task-assets`/`lockfile-sync`, and the build-info
      staleness marker are recorded (in this task or as linked follow-up
      tasks), even if no code changes result from some of them.
- [ ] `repoos check` passes.

## Related

- #0345 — the squishy MTD failure that surfaced both this and the sibling
  CLI-selection-label fix (already committed directly to main, see #0345's
  activity).
- #0276 — established the local-CLI-first / global-CLI-fallback selection
  this task's audit touches on (build-info staleness marker).

## Activity

- 2026-09-15T07:46:52Z · created · unknown
- 2026-09-15T08:13:26Z · model_override
- 2026-09-15T08:16:26Z · review_model_override
- 2026-09-15T08:16:33Z · status inbox→ready
- 2026-09-15T08:16:35Z · status ready→active, branch
- 2026-09-15T08:45:36Z · status active→review
- 2026-09-15T09:29:53Z · note: Review suggestions addressed (commit 6e0f8185 on this branch, repoos check green): RepoOS's own UI smoke test now runs through the generic smoke declaration (package.json smoke script -> scripts/ui-smoke.mjs -> src/commands/ui-smoke.ts), and the pkg.name === "repoos" special case in check.ts is removed. A test fails if the declaration goes missing. Audit follow-ups filed: #0349 (build-info staleness skip, p1), #0350 (task-assets honors workDir/inputsDir), #0351 (css-layers/theme-contrast configurable), #0352 (bare-require source roots).
