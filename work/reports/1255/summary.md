---
id: summary
title: summary
type: feature
status: inbox
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: ""
---
## TL;DR

Task 1255 was a QA pass over the update-available banner, version display, release notes modal and restart notice at 375/768/1280 px, with fixes for whatever it found. It shipped a 599-line headless WebKit harness (`docs/qa/measure-update-banner.mjs`), a QA record (`docs/qa/2026-11-update-banner-qa.md`), copy/layout/fixture fixes in `ReleaseUpdateNotification.vue`, and a shared list-marker rule plus a source-scanning guard test covering every markdown surface in the UI. It took 4 engineer rounds and 5 review passes (4 × "needs some work", then "good to go"); most of the review friction came from the list-marker fix being applied one surface at a time instead of as a class. Done 2026-11-20T03:16:41Z, merged as commit `65f6c7a2e16abadb6d49111e9ba4cd197b4bb73a`.

## Outcome

What shipped, in plain English:

- **A headless, fixture-only QA harness** (`docs/qa/measure-update-banner.mjs`) that serves the built SPA from a throwaway fixture root, runs headless WebKit at 375/768/1280 px, and intercepts the four update endpoints. The restart POST is faked by construction, so no real server was ever restarted, per the acceptance criteria.
- **The QA record** `docs/qa/2026-11-update-banner-qa.md`, covering supervised, hand-run, failure and dismissed states.
- **Product fixes:** the restart notice copy now says the server restarts "with the same settings and port it was started with" and links "Read more on GitHub" instead of an issue number; "serve flags" wording replaced; the supervised "waiting" line is a styled, full-row element; release-note lists regained their bullets (a global list reset had removed them).
- **A class-level fix for list markers:** one shared `list-style` rule in `src/ui-app/src/style.css` covering all 8 markdown containers (release notes, story/review renders, PM, CTO, debugger, playground, task-debugger and repo-guide chats), plus `src/ui-app/tests/markdown-list-markers.test.ts`, which scans every `v-html` site in files that import a markdown renderer and also statically requires the 8 container classes to keep their rules.
- **Fixture fix:** the restart-failure capture now includes the `restartCommand` the real status route always sends.
- **Regression tests** in `releases.test.ts` for the copy and layout changes.

**Final verdict:** review pass 5 returned `good to go`; the task closed as `done` with `release:success`.

## Process stats

- **Wall clock, creation to done:** 2026-11-19T23:27:47Z → 2026-11-20T03:16:41Z = 3 h 48 m 54 s.
- **Engineer rounds:** 4 (rounds 1–4), all "claude code · haiku". No engineer model swaps recorded.
- **Review passes:** 5, all by `opencode-go/glm-5.3-flash`: passes 1–4 `needs some work`, pass 5 `good to go`.
- **Restarts/swaps:** none recorded, except one incident: at 23:58:35Z the runner adopted an orphaned engineer process (pid 71438).
- **Tokens and cost** (from the recorded sessions table; incomplete):
- Reviewer: 5 sessions, 51–201 s each (580 s total), tokens 84,578 / 35,399 / 14,376 / 42,047 / 67,578 (243,978 summed), cost $0.07142301 / $0.01279113 / $0.0099808 / $0.01812051 / $0.04031143 ($0.15262688 summed).
- Engineer: only one session has recorded stats (the errored round-3→4 session: 4,200 s, 66,624 tokens, $2.36605539). The other engineer sessions' tokens and costs are not recorded.
- **Close-out gate:** completed in 1,400 s.

## What went wrong

- **The marker fix was incomplete three times.** Round 1 fixed only release notes; review found 5 sibling markdown surfaces with the same Tailwind-preflight defect. Round 2 added a shared rule + static surface list; review found 2 chat surfaces (`td-markdown`, `guide-markdown`) still missing. Round 3 fixed those; review (pass 4) found the rewritten guard test matched only literal `renderMarkdown(...)` calls and silently stopped covering computed-property surfaces (`.md-rendered`, `.release-update-markdown`). Round 4 fixed the scan at the file level (any `v-html` in a renderer-importing file) plus a static `REQUIRED_CONTAINERS` list, and corrected the overstated `style.css` comment and QA doc. Pass 5 then passed.
- **QA harness churn.** The first run produced 18 failures out of 126 checks; 9 were harness artifacts (`innerText` applying CSS `text-transform`, reload-abort "access control" noise, an intentional 500), 6 were copy defects, 3 were a fixture gap. Later, a "dialog fits" check failed ~half the runs — traced to `getBoundingClientRect()` returning the union box of a wrapped link's fragments; fixed by hit-testing each `getClientRects()` fragment.
- **Two unexplained intermittents, left open:** one run of 135 checks failed once with no captured detail (three clean reruns followed), and after the fragment fix one of 11 runs hit a 5 s timeout waiting for "Restart is waiting" (six further runs clean). Both are recorded as open in the QA doc rather than papered over with retries or longer waits.
- **Message-queue/handoff congestion.** The engineer session errored with "handoff deferred — read the queued message(s) first"; a turn was ended (exit 143) specifically so a queued message could be delivered; CTO nudges were held three times ("undelivered message already queued" ×2, "handoff gate is running" ×2); one queued message went undelivered 60+ minutes and was flagged overdue at 03:09:27Z. All resolved by delivery/resume; the task completed normally.
- **A git `index.lock` in the main checkout's worktree metadata** blocked a handoff. A `claude -p` session for another task was running; the engineer did not confirm it held the lock, did not remove the lock, and did not touch the main checkout. The self-check committed the round's four files as WIP checkpoint `1d49b7c52`, and handoff was retried successfully later.
- **Full test suite under load:** in one partial parallel run, three unrelated suites (`release-status`, `debugger-integration`, `mtd-docs-fast-path`, two at the 30 s timeout) failed; all three passed in isolation (73/73), attributed to load. Also, vitest needs `--config src/ui-app/vite.config.ts` to transform `.vue` files, and CSS `?raw` imports return empty strings in vitest.

## Learnings

- **Fix the defect class, not the surface.** The single biggest time sink here was re-fixing the same Tailwind-preflight list-marker defect surface by surface across three rounds. The durable form is one shared CSS rule plus a guard that fails when a new surface lacks it — now in place.
- **A guard test that hand-keeps a list will drift; but a regex scan is only as complete as its pattern.** The literal-call scan missed computed-property surfaces. The robust shape used here: file-level inference (a file that imports a markdown renderer treats all its `v-html` as markdown) plus a static required-containers list. This trade-off is documented in the `style.css` comment and QA doc §4, where it belongs.
- **Classify every harness failure against a screenshot before touching product code.** 9 of 18 first-run failures were harness artifacts; blind assertion-fixing would have masked the real product defects.
- **`getBoundingClientRect()` is not a hit test for wrapped inline elements** — its union box spans line gaps. Test each fragment via `getClientRects()`. Fit checks should also print their measurements on failure; that one change turned an apparent flake into a deterministic geometry answer in minutes.
- **Don't hide intermittents with retries.** Both open intermittents are recorded as open with run counts, which is more useful to the next reader than a green number.
- **A fixture can hide a real defect** — the restart-failure capture shipped without the command the real API always sends.
- Internal vocabulary in user-facing copy ("serve flags", an issue number as the only link) reads fine to the author; cheap grep-style regression tests pin it.
- Candidate durable rules worth carrying into `docs/agent-ui-and-preview-conventions.md` or a future AGENTS.md line: "when a UI fix touches one markdown surface, grep for all `v-html` render sites and fix the class" and "vitest cannot read CSS via `?raw`; read style files from disk". Neither is filed yet.

## Follow-ups

None recorded in Linked tasks. Unfiled candidates identified during the pass (worth filing):

- A human should run one real hand-run restart on a disposable server; restart and dismiss were verified against faked endpoints only (by design, honestly recorded in the QA doc).
- The top-bar "New version available" button calls `repo.restartServer()` directly — no dialog, no "Restart when idle", no dismiss.
- The open 1/11 supervised-restart harness timeout needs a longer soak or a cause.
- Trace why the sidebar version label is hidden at 375/768 px, and why the App theme store overrides the `restartPendingDark` shot fixture.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
