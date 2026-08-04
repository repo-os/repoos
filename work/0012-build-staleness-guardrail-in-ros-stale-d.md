---
id: "0012"
title: Build-staleness guardrail in ros (stale dist/ detection)
type: feature
status: review
priority: p1
area: cli
assigned_to: ai
created_by: nick
branch: feat/0008-build-staleness-check
created_at: "2026-06-02T08:30:00Z"
updated_at: "2026-06-19T06:29:27Z"
---
## Problem

In the self-hosted / linked dev setup, `ros` runs compiled `dist/`, not `src/`.
Editing `src/` without `bun run build` means the running `ros` executes OLD
code and the server serves the OLD UI — with no error, because the version
string in `dist/` is unchanged. `ros version` cannot detect this: it reports
the release line, which does not move when source changes. This stale-build
hazard is already named in AGENTS.md as the #1 time-waster.

It is currently handled by a PROSE RULE asking the agent to remember to rebuild.
Vigilance rules are forgettable. Convert it into a TOOL GUARDRAIL that detects
staleness automatically.

## Desired outcome

`ros` detects when its own `dist/` is stale relative to its own `src/` and warns
(default) or refuses (strict), so neither a human nor an agent unknowingly runs
old compiled code or serves an old UI.

Example warning (illustrative):

    ⚠  Stale build: src/ has changed since the last `bun run build`.
       You are running OLD compiled code, and `ros serve` serves the OLD UI.
       Run `bun run build` to update.

## Acceptance criteria

- [ ] The check compares the running `ros` binary's OWN `dist/` against its OWN
      `src/` — its build provenance — NOT the target repo's cwd. It only
      activates when both `src/` and `dist/` exist beside the running binary
      (a linked dev build). For a published install (dist-only, no `src/`), it
      is a SILENT no-op — users must never see it.
- [ ] Primary mechanism: a build marker (e.g. `dist/.build-info.json`) recording
      a hash of `src/` at build time. At startup, recompute the `src/` hash and
      compare. Prefer this over raw mtime comparison (see Notes).
- [ ] The hash/marker covers ALL of `src/` including `src/ui/`, so a stale
      served UI is caught (src/ui/app.html → dist/ui/app.html via asset copy).
- [ ] On stale: clear warning to stderr naming that BOTH compiled code and the
      served UI are old, with the exact fix (`bun run build`). Proceeds by
      default (advisory).
- [ ] Strict mode refuses with a non-zero exit instead of warning. Enabled via
      `repoos.toml` (`strictBuild = true`), a `--strict-build` flag, or
      `REPOOS_STRICT_BUILD=1`.
- [ ] Distinct messages for: stale (src newer than build) vs. no `dist/` at all
      ("no build found — run `bun run build`") vs. no marker present (pre-feature
      build — degrade gracefully: warn that freshness can't be verified, don't
      hard-fail).
- [ ] Runs on `ros serve` (mandatory — it's the long-lived, UI-serving command).
      Decide whether to also run on every command (the check is cheap); exclude
      `version`/`help`.
- [ ] The build pipeline writes the marker (extend the existing build /
      copy-assets step so every `bun run build` refreshes it).
- [ ] Update AGENTS.md: replace the "remember to detect staleness" framing in
      the self-hosting section with response-to-signal framing — "`ros` warns
      automatically when the build is stale; if you see that warning, run
      `bun run build` before trusting any `ros` output or the UI." The tool
      detects; the rule directs the response.

## Notes for AI

This task is the GUARDRAIL version of a prose rule — the goal is to make the
stale-build hazard impossible to forget, not to remind harder. Specifics:

- Do NOT rely on raw file mtimes as the primary mechanism. `git checkout` does
  not preserve mtimes (a fresh clone sets them all to checkout time), and clock
  skew across machines makes mtime comparison unreliable. A source-hash marker
  written at build time is robust against both. If you keep an mtime path as a
  cheap fallback, document the caveat.
- The check is about the running BINARY's package, located relative to the
  compiled file via `import.meta.url` (same resolution pattern as `findUiHtml`
  in the server). It is NOT about the cwd / target repo. Running a linked `ros`
  inside the TUK repo should still check the `ros` binary's own src/dist —
  because that's the code that's stale.
- Keep it cheap: hash only `src/` (a small tree); never walk `node_modules` or
  `dist`. Sub-millisecond is the target; this runs on command startup.
- Do NOT auto-rebuild. Surface and instruct; the rebuild is an explicit step.
  Silent auto-build inside a command that wasn't asked to build violates the
  mental model and hides build failures.
- Silent no-op for published installs is a hard requirement — a global
  `npm i -g repoos` user has no `src/` and must never see staleness output.
- This task's own frontmatter uses `created_at` (UTC/Z) per the current format
  (see 0007). Match whatever 0007 actually landed (field name + precision).

## Follow-up (do not build here)

- Inject the build hash/time into the served HTML so the BROWSER can show a
  stale-UI indicator — terminal warnings don't reach whoever's looking at the
  UI. Note the intent; defer to a separate task.

## Related

- Directly mitigates the stale-build hazard in the AGENTS.md self-hosting
  section and ADR-0003. This is the canonical example of converting a vigilance
  rule into a tool guardrail — a pattern worth repeating.

## Activity

- 2026-06-02T17:48:05Z · status review→done
- 2026-06-19T06:27:51Z · status done→review
- 2026-06-19T06:27:54Z · status review→active
- 2026-06-19T06:27:57Z · status active→review
- 2026-06-19T06:27:58Z · status review→done
- 2026-06-19T06:28:00Z · status done→review
- 2026-06-19T06:28:01Z · status review→active
- 2026-06-19T06:29:21Z · status active→inbox
- 2026-06-19T06:29:22Z · status inbox→ready
- 2026-06-19T06:29:23Z · status ready→active
- 2026-06-19T06:29:25Z · status active→review
- 2026-06-19T06:29:26Z · status review→done
- 2026-06-19T06:29:27Z · status done→active
- 2026-06-19T06:29:27Z · status active→review
