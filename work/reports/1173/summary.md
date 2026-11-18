## TL;DR

A desktop QA pass on the Agents, Checks, Settings and Releases web pages found one real bug — the Settings import success notice was unmounted before the user could see it — and shipped a fix with a regression test. Round 1 covered navigation and read-only controls only and was sent back for skipping the side-effecting flows; round 2 exercised those flows with intercepted API fixtures, found the import bug, and fixed it. Verdict: good to go; merged as `0835df41f0e52ec9f94d49871cd3886f52444cac` with release success.

## Outcome

The task shipped two things:

1. **A QA findings record** at `docs/qa/2026-11-web-desktop-pages.md` covering all four pages (Agents, Checks, Settings, Releases) at a 1440×1000 desktop viewport on the auth-less dev server (`just serve-noauth`), including route loads, tab navigation, refresh/preview/copy controls, and — after review — the full action flows (model test, agent create/edit, settings export and import, release create/publish, release email send) with write endpoints intercepted in the browser so no config was written, no release published and no email sent.
2. **A real bug fix in Settings import/export.** Applying an imported settings export called `config.load()` to refresh values; the normal load path sets `loaded` to false, which made the Settings page unmount the import/export panel before its async handler could show the success notice. The fix adds an optional `keepLoaded` flag to `config.load` (used by the post-import refresh; initial loads and ordinary refreshes keep the skeleton behavior), plus a config-store regression test asserting `loaded` stays true while the refresh request is open. Changed files: `src/ui-app/src/stores/config.ts`, `src/ui-app/src/components/SettingsImportExport.vue`, `src/ui-app/tests/config-store.test.ts`, and the QA doc.

The scenarios already covered by #1157 and #1168 were deliberately skipped. Final review verdict: **good to go** (pass 2, 2026-11-18T05:53:46Z).

## Process stats

| Metric | Value |
| --- | --- |
| Created → done | 2026-11-18T03:57:22Z → 2026-11-18T06:18:00Z (2 h 20 m 38 s wall clock) |
| Engineering rounds | 2 (both `codex` / `gpt-6-luna`) |
| Review passes | 2 — pass 1 "needs some work", pass 2 "good to go" (both `codex` / `gpt-6-luna`) |
| Engineer sessions | 1 (started 03:57:36Z, elapsed 4227 s, 29,288,899 tokens) |
| Reviewer sessions | 2 (129,532 tokens @ 35 s; 143,493 tokens @ 26 s) |
| Watchdog auto-resumes | 3 of 3 used |
| CTO nudges | 2 (both "held — handoff gate is running") |
| Close-out gate | 995 s |
| Cost | not recorded |

## What went wrong

- **The first five engineer turns all exited cleanly without a handoff** (04:00:53, 04:10:03, 04:24:05, 04:35:57, 04:44:38), each blocked on browser access: the computer-use (CUA) browser host reported no available browsers, and the native Chrome — a separate host from the runner — got `ERR_CONNECTION_REFUSED` against the server bound to the runner's `127.0.0.1`. The turns ended without code changes. The watchdog auto-resumed the engineer three times (04:29, 04:41, 04:49) before the sixth turn solved it by launching the repository-installed Playwright Chromium **inside the runner**, which could reach the same server directly, and completing the QA pass.
- **Review pass 1 rejected the scope** (05:05: "needs some work"): the QA doc covered navigation and read-only controls but left model tests, agent edits, import/export, release creation/publication and release email unexercised, so the "every control works" criterion was unverified. Resolution: round 2 reran the flows using browser-side route interception with fixtures, which exercised the real Vue controls without persistent side effects — and surfaced the import unmount bug.
- **Repeated `apply_patch verification failed` errors** appear in the runner stderr against `.repoos/engineering-report-drafts/1173.md` (draft-file edit mismatches). These were scratch-state failures; they did not block the committed work.
- **Shot capture skipped at first handoff** (05:04: the 3-path diff touched no capture target), then **1 of 1 declared shot captured with clean console** on the final handoff (05:53).
- **A queued message was discarded** at close-out (06:17:33, "task is done") — benign bookkeeping, not a failure.

## Learnings

- **Browser-host topology matters for live QA.** In this setup `127.0.0.1` resolves to the runner from the Playwright process but not from the separate computer-use Chrome host, so "Chrome can't connect" is a network-boundary fact, not a server bug. Five turns were lost to this. Durable rule candidate for `docs/agent-ui-and-preview-conventions.md`: when driving a runner-local server for QA, use an in-runner browser (Playwright Chromium) or an explicitly supported preview connection; document in the QA record which browser produced the evidence, since it is not proof of what the user's installed Chrome renders.
- **Child-component tests can miss parent-controlled lifecycle.** The existing import test mounted the child alone, so it couldn't see the parent unmounting it when a store refresh toggled a page-level loading flag. Rule of thumb worth adding to `docs/agent-debugging-and-incidents.md` or a testing convention note: when an async UI action refreshes shared state, check whether that refresh changes the parent's mount conditions; a keep-visible refresh option (`keepLoaded`) is the general shape of the fix.
- **Intercepted-request QA is the pattern for side-effecting controls.** Click the real control, assert the request's important fields, return a representative fixture, confirm the UI outcome — stronger evidence than a static view inventory without real writes, publishes, emails or provider calls. Worth recording alongside the QA doc convention.

## Follow-ups

None — no linked tasks were recorded. (The environment limitation above is a docs-carry learning rather than a filed task.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
