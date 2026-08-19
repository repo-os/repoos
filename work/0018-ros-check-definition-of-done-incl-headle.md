---
id: "0018"
title: ros check — definition-of-done incl. headless UI smoke check
type: feature
status: done
priority: p1
area: cli
assigned_to: ai
created_by: nick
branch: feat/0014-ros-check
created_at: "2026-06-03T07:48:52Z"
updated_at: "2026-08-06T06:53:36Z"
---
## Activity

- 2026-06-03T07:48:52Z · created · unknown
- 2026-08-06T06:53:36Z · status review→done · repoos check ships all gates incl. UI smoke

## Problem

A broken UI (Vue not mounting → raw mustache) shipped through review because
nothing verified the UI actually RENDERS. Build, typecheck, server-start, and
HTTP-200 checks all pass while the app is dead in the browser — server-side
checks structurally cannot catch client-side mount failures. There is no single
command an agent (or human, or CI) runs to confirm a change didn't break things.

## Desired outcome

One command — `ros check` — that runs the full definition-of-done: build,
typecheck, tests, and a HEADLESS BROWSER smoke check that catches exactly the
failure class that just shipped. A green `ros check` is the bar before a task
moves to review.

## Acceptance criteria

- [ ] `ros check` runs, in sequence with clear per-stage output: `bun run
      build`, typecheck, the test suite (if present), and a headless UI smoke
      check.
- [ ] The UI smoke check launches a headless browser, loads the served UI, and
      asserts:
      - the app MOUNTED — no unrendered `{{ }}` mustache in the DOM, and a known
        root element rendered with real content
      - the browser console has ZERO errors
      - (nice) exactly one overlay can be open at a time; key views render
- [ ] The smoke check MUST fail against the current broken state (raw mustache /
      unmounted app) and pass once mounting is fixed. If it can't detect that,
      it isn't doing its job.
- [ ] The headless browser library (Playwright recommended) is a DEV dependency
      ONLY — never a runtime dep, never imported by anything in `dist/`, never
      in the published package's dependencies. The zero-runtime-deps invariant
      holds; verify the published dependency tree stays empty of it.
- [ ] If the browser binary isn't installed, the UI smoke check SKIPS with a
      clear message ("UI smoke check skipped: run `npx playwright install
      chromium`") and the other checks still run — it must not hard-crash
      `ros check` for someone who hasn't installed the browser.
- [ ] `ros check` exits non-zero on any failure (usable in CI and as a gate).
- [ ] Output clearly names which stage failed and why.
- [ ] AGENTS.md: add a definition-of-done — "run `ros check` and confirm green
      before moving a task to review." This replaces ad-hoc "remember to verify."
- [ ] (If 0012 has landed) fold the build-staleness check into `ros check` too.

## Notes for AI

- This converts a vigilance rule ("remember to verify the UI") into a tool the
  agent and CI just run — the same guardrail-over-vigilance pattern as the
  build-staleness check (0012).
- The smoke check's entire reason to exist is catching client-side mount
  failures that 200-OK checks miss. Prove it: it must FAIL on the broken
  (mustache) state and PASS after the fix.
- This introduces the first dev dependency that pulls in a BROWSER BINARY
  (~100-300MB Chromium) — heavier and more environment-sensitive than a normal
  package. Use Playwright (cleaner browser/install management than Puppeteer in
  2026). The npm package is small; the browser binary is the real cost and the
  fragile part.
- DEV-ONLY is a hard line: add it under devDependencies, never dependencies. The
  smoke-check code lives in test/check tooling, never in any path that ships in
  `dist/` or that the published package loads.
- The browser binary install differs across environments (CI needs
  `--no-sandbox`; Arch/Linux may need system libs/fonts; macOS differs). Test
  the smoke check on a real target machine (e.g. the Beelink), not only where it
  was written. Launching headless Chromium in restricted environments often
  needs `--no-sandbox` and explicit args.
- Degrade gracefully if the browser is absent (skip + clear message) so
  `ros check` stays usable for someone who ran `bun install` but not the browser
  download. The browser check is the one stage allowed to be "set up
  separately" — never assume it's present.
- Keep it reasonably fast: spin up the server (or reuse a running one), one
  headless page load, assert, tear down.
- Frontmatter uses `created_at` (UTC/Z) per the current format.

## Scope

- v1: build + typecheck + test + headless mount/console smoke check, one command.
- Defer (note intent, don't build): full visual regression / screenshot
  diffing, multi-viewport checks, per-view deep assertions.

## Related

- Directly caused by the 0013 incident — the check that would have caught it.
- Same guardrail-over-vigilance pattern as the build-staleness check (0012).
- Pairs with / can absorb the test suite when built.
