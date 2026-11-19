## TL;DR

Task 1248 was a QA pass on file uploads for the Inputs and Context pages. It shipped a client-side upload guard for the Inputs path (wrong type, empty file and over-10 MB files are rejected before reading, with plain-English reasons), a 12-file cap that now holds across multi-file drops, duplicate-name renaming, honest server status codes (400/413/404/500 instead of 404 for every failure), and a fix for a layout bug that pushed the "Dismiss" button off-screen at 375 px. Headless WebKit audits at 375, 768 and 1280 px plus a 277-line unit/integration test file back the changes. Context (doc and skill) uploads were deliberately left without limits — that is a product decision — and were recorded as open items in the QA doc. The task completed in one engineering round and one review pass (`good to go`) in 1 h 11 min 3 s from creation to done, with one watchdog restart of the engineer and no model swaps.

## Outcome

**What shipped** (merged commit `7ef53db975fa895011cf3c1fe9d5a80011a6a8fb`, branch `feat/qa-pass-inputs-and-context-uploads-with-`):

- **Client-side upload guard for Inputs** (`src/ui-app/src/lib/upload-guard.ts`): wrong-type, empty and over-10 MB files are rejected in the browser before being read, each with a plain-English sentence explaining what went wrong and what to do. A test asserts the client size limit matches the server constant so the two cannot drift.
- **A working 12-file cap.** The old check counted files before `FileReader.onload` ran, so a 15-file drop queued all 15. Slots are now reserved synchronously at pick time and filled on load; a failed read removes its slot, and Submit stays disabled while any slot is empty.
- **Duplicate-name handling:** same-named files are renamed instead of silently overwriting each other.
- **Honest server responses** (`src/server/routes/inputs.ts`): the attachment route now returns 400 (bad type), 413 (too large), 404 (missing input) and 500 (server error) where it previously returned 404 for every failure — which is why the UI could only ever show a generic "not found" for an oversized file. Validation runs before anything reaches disk, placed in the route handler rather than `core/input.ts` so `core` does not import from `server`.
- **Upload notices UI:** rejections render as a `role="alert"` block with a Dismiss button (`ui.inputUploadNotices`), staying visible while the person decides what to do with the rejected file.
- **Layout fix at 375 px:** the `.ff-upload-followup .btn-row > *` rule was scoped so a wide "Dismiss <file name>" button wraps instead of spilling off the left edge (the first browser audit found it at x = −121).
- **Tests and QA doc:** `input-upload-guard.test.ts` (+277), `new-input-uploads-qa-browser.test.ts` (+230, mounts real components in jsdom, injects the markup into headless WebKit with built global CSS — no live server, per the acceptance criteria), and `docs/qa/2026-11-uploads-failures-qa.md` (+88).

**Not shipped, deliberately:** Context uploads (doc and skill panels) still have no type or size limits. The engineer read both panels and did not invent limits, since choosing a cap is a product decision; the panels do already render `uploadError` and handle `reader.onerror`, so failing uploads there at least say something. The reviewer accepted this scoping but flagged that the human should confirm follow-ups get filed.

**Final verdict:** review pass 1 returned `good to go`; close-out completed and the task reached `done` with `release:success`.

## Process stats

- **Engineering rounds:** 1 (round recorded 2026-11-19T22:19:04Z). **Review passes:** 1, verdict `good to go`. No re-review was needed.
- **Wall-clock start to done:** created 2026-11-19T21:26:57Z, done 2026-11-19T22:38:00Z — 1 h 11 min 3 s.
- **Agents and models per role:**
  - Engineer: `claude code` agent, model `haiku`. Session elapsed 971 s (~16 min), 56,371 tokens, cost $0.4532 (recorded 0.45318601).
  - Reviewer: `opencode` agent, model `opencode-go/glm-5.3-flash`. Session elapsed 153 s, 58,954 tokens, cost $0.0297 (recorded 0.02966962).
  - Routing: `Model router (jev)`, model unknown, 0 s elapsed, no tokens or cost recorded.
- **Totals where known:** 115,325 tokens, $0.4829 (recorded values sum to 0.48285563). Cost per engineering round: one engineer session is recorded in the sessions table; the watchdog restart below did not produce a second recorded engineer session.
- **Restarts:** one watchdog restart of the engineer (2026-11-19T22:04:02Z). **Model swaps:** none recorded.
- **Close-out gate:** completed in 837 s (~14 min) at 2026-11-19T22:35:51Z.

## What went wrong

1. **Orphaned engineer process.** At 21:42:46Z, less than 16 minutes after start, the runner adopted orphaned engineer pid 61756. Resolved by adoption — the session continued and finished normally. No follow-up was filed on why the process orphaned.
2. **Watchdog restart after a stalled message.** At 22:01:01Z a message was queued; by 22:04:02Z the watchdog restarted the engineer because the queued message had waited 3 minutes with no live process. The message was delivered one second later (22:04:03Z). Resolution was automatic; the task proceeded to handoff without further stalls.
3. **Three held CTO nudges.** The CTO attempted nudges at 21:47:01Z, 22:01:11Z and 22:17:45Z; each was correctly held (twice because the handoff gate was running, once because an undelivered message was already queued). These were not failures, but they show the backpressure mechanisms firing repeatedly on a short task — worth noting for anyone reading the log as a burst of "held" lines.
4. **First vitest run failed for the wrong reason.** Running `bunx vitest run` from the repo root produced a parse error on `.vue` files, because the Vue plugin lives in `src/ui-app/vite.config.ts`. Fixed by passing `--config src/ui-app/vite.config.ts` for focused runs. This cost some engineer time but no gate failure.
5. **First browser audit found a real bug.** At 375 px the "Dismiss <file name>" button sat at x = −121, pushed off the left edge by the non-wrapping, end-aligned `.btn-row` flex row with a long unbroken label. Fixed by scoping `flex-wrap`/wrap behaviour to `.ff-upload-followup` (a global change to `.btn-row` was rejected as broader than the bug), then rebuilt with `bun run build:ui` because the test reads the built stylesheet.
6. **Size wording bug in the new guard.** A file one byte over the cap rendered as "10.0 MB … the limit is 10.0 MB". Fixed: over-limit sizes round up to one decimal; the limit displays as a whole number. Caught in QA, not by a user.
7. **Pre-existing bug surfaced by the QA method:** the server route returned 404 for every upload failure. Fixed as part of the change (see Outcome). No gate or check failed at any point in the recorded log; the handoff browser console check passed on both verification runs (22:01:00Z and 22:19:04Z, one shot each, clean console).

## Learnings

- **Check the trust boundary, not the rendered page.** The single most valuable finding of this QA pass was not visual: the server returned 404 for every upload failure and the client never checked type or size. Auditing the route's status mapping found more than screenshotting the UI. This is a durable QA-method point that belongs in `docs/agent-ui-and-preview-conventions.md` (or a QA-methods doc) alongside the existing headless-audit guidance: for upload/IO surfaces, audit the server status codes and client pre-read guards first, then the pixels.
- **A counter checked before an async push is not a cap.** Reserving the slot synchronously before `FileReader.onload` is what makes a multi-file limit hold. This is a recurring Vue/async-UI pattern; it belongs in `docs/agent-ui-and-preview-conventions.md` if QA passes keep hitting upload UX.
- **Non-wrapping flex rows aligned to the end push wide controls off-screen at narrow widths**, and a long unbroken label is the worst case. QA fixtures should always include one. Candidate for the narrow-width checklist in the UI conventions doc.
- **Do not invent numeric limits in code when they are product decisions.** The engineer deferred Context-upload caps to the QA doc's open items instead of guessing, which the reviewer accepted. This matches the existing AGENTS.md posture on not widening scope silently; the QA doc (`docs/qa/2026-11-uploads-failures-qa.md`) is the recorded home for the open items.
- **Focused vitest runs on this repo must pass `--config src/ui-app/vite.config.ts`** or `.vue` files fail to parse. This is a durable repo fact worth one line in `docs/architecture.md` or the testing section of AGENTS.md if it is not already there.

## Follow-ups

None recorded. Linked tasks is empty, and no `repoos new` entries were created from this task's issues. Note the explicit gap the reviewer flagged: the QA doc's open items (type/size limits for Context doc and skill uploads; the `addScreenshots`/`addPmScreenshots` cap race and missing guards in the same store file) and the reviewer's small suggestions (a stale one-line JSDoc above the new block in `src/ui-app/src/stores/ui.ts`; a declared shot of the New input panel with rejection notices at 375 px) were recommended for follow-up tasks but none were filed before close-out. If the human wants the Context-upload limits decided, that decision is currently tracked only inside `docs/qa/2026-11-uploads-failures-qa.md`.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
