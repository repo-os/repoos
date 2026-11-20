## TL;DR

Task 1269 was a QA sweep of the command palette (`SearchOverlay.vue`) and global keyboard shortcuts. The palette is shared by three callers (header ⌘K pill, settings palette, context palette), so fixes were made once in the component: focus restore on dismissal (with a connected-check fallback chain), full combobox ARIA wiring, scroll-into-view for the highlighted option, accurate empty/loading copy, and a fix for duplicate-row keys. Three engineering rounds and three review passes were needed; review verdict moved `needs some work` → `needs some work` → `good to go`, and the task landed as `done` (release:success) on 2026-11-20 at 11:17:04Z, merged as commit `086cae6`. Total recorded spend: 157,596 tokens / $2.67.

## Outcome

Shipped, on branch `feat/qa-pass-command-palette-and-global-keybo`:

- **Focus after dismissal**: the overlay now records `document.activeElement` on open and restores it on close, falling back to the header pill when the remembered element is disconnected. Focus is resolved inside the `setTimeout(0)` callback so a route push (which can unmount the caller's trigger, e.g. a context-scope doc result navigating away from `ContextView`) is accounted for. Task results skip restore (the drawer takes focus); doc/skill/setting results restore it; a caller's explicit `returnFocusEl` always wins.
- **Screen-reader semantics**: the input is a proper combobox (`aria-controls`, `aria-activedescendant`, `aria-expanded` tied to whether the listbox is rendered), rows carry ids, group wrappers are `role="group"`, the keyboard legend is a labelled group, and empty/loading/truncated copy lives in one persistent `role="status"` region outside the listbox (valid listbox children only).
- **Keyboard scroll**: a watcher calls `scrollIntoView({ block: "nearest" })` on the active option.
- **Copy and state**: empty state names the query; a `loadingBodies` flag shows "Loading results…" while doc bodies fetch, guarded by an in-flight counter so an older load can't clear the flag early.
- **Tests**: new jsdom suite `command-palette-a11y-qa.test.ts` (23 tests) and an extended WebKit three-width (375/768/1280) browser suite, including an empty-result overflow audit — this satisfies the task's headless width-walk criterion.

Final verdict: review pass 3, `good to go`; status `done→done, release:success`.

## Process stats

- **Created → done**: 2026-11-20T05:08:53Z → 2026-11-20T11:17:04Z = 6 h 8 m 11 s wall-clock.
- **Engineering rounds**: 3 (handoffs at 05:46:25, 06:01:58, 06:25:52Z).
- **Review passes**: 3 — pass 1 `needs some work` (05:49:05), pass 2 `needs some work` (06:03:55), pass 3 `good to go` (06:23:51).
- **Agents / models**:
  - Engineer: `claude code · haiku`. One engineer session is recorded in the sessions table (started 05:10:14Z, elapsed 3532 s, 12,950 tokens, $2.6091829), with status "finished (the agent process exited with an error)" — the activity log records the same turn exiting cleanly with code 0 but without requesting review. Only one engineer session is listed despite three rounds; per-round session splits are not recorded.
  - Reviewer: `opencode · opencode-go/glm-5.3-flash`, three sessions (153 s / 49,343 tokens / $0.02173379; 115 s / 44,559 tokens / $0.01391086; 108 s / 50,744 tokens / $0.0234033).
  - Routing: "Model router (jev)", model `unknown`, three 0 s sessions, no tokens/cost recorded.
  - No restarts or model swaps are recorded. `cli_override` and `model_override` events are logged at 05:09:31 (agent/model selection at start; the overridden values are not recorded).
- **Token / cost totals**: engineer 12,950 tokens / $2.6091829; reviewers 144,646 tokens / $0.05904795; **overall 157,596 tokens / $2.66823085**.
- **Close-out gate**: completed in 858 s (~14.3 min) at 11:15:11Z.

## What went wrong

- **CTO nudge at 05:42:27** — a completion reminder after 5 min without worktree activity; the next nudge was held because an undelivered message was already queued.
- **Round-1 review found two ARIA defects** (invalid listbox children; `aria-expanded` wiring) → round 2 fixed them.
- **Round-2 review found a detached focus-restore branch** (caller-supplied `returnFocusEl` unchecked; context-scope doc/skill results could drop focus to `body`) → round 3 fixed it with the connected-check fallback chain. A round-3 follow-up review question about `ui.openTask` failing turned out not to be a real bug (verified in code, left unchanged).
- **Engineer turn ended without a handoff at 06:09:53** — the turn exited cleanly (code 0) while the scoped check was still running, saying it would wait for completion; RepoOS resumed the engineer to read queued messages, then accepted a CLI handoff request seconds later. The engineer was also manually stopped by request at 06:07:06 and restarted at 06:09:53.
- **Scoped check first failed in the remote gate's typecheck** — the new test's `mount`/`setProps` were typed from the `.vue` shim and rejected `open`. Fixed by routing mounts through one typed helper and casting `setProps`; the rerun passed.
- **`bun run build` fails at its `vue-tsc` step** on pre-existing type errors in components this task did not touch (`CheckRunsPanel.vue`, `DebuggerChat.vue`, `InputCard.vue`, `ModelPlaygroundPanel.vue`, `ChatQueuedNotice.vue`). Worked around with a direct `vite build` so the WebKit suites had assets; the pre-existing errors were left for a separate task.
- **Handoff deferred at 06:09:53** — 1 queued message had to be read before review; resolved by resuming the engineer, which delivered 2 messages.
- **Stale shot evidence**: the declared palette shot was captured on tree `c6f24eee09`, before the final focus-restore fixes in `0d49299ac`. Pass 3's verdict was explicitly "good to go — STALE-EVIDENCE-ONLY" with a re-capture request queued at 06:43:16. Whether the shot was ever re-captured on the final tree is not recorded; that queued message went undelivered (flagged overdue at 07:46:52 after 60 min) and was dropped at 11:15:29 because the task was done.
- **Watchdog escalation at 10:37:05** — "check wait escalated": waiting on the serialized local fallback (position 2), slot holder 49112 dead for 16 m. Cleared at 10:42:06; no action beyond the watchdog's own recovery is recorded.
- **Read-only `docs/qa/*` records** (`2026-11-stories-inbox-search-qa.md`, `2026-11-keyboard-shortcuts-qa.md`) could not be updated — they are locked (`-r--r--r--`), so one stale line calling the empty copy "context-free" remains, and the keyboard record lacks a #1269 section.

## Learnings

- **Fix the class in the shared component, not the caller.** Patching `SearchBar.vue` alone would have left focus-loss open for every other palette caller; the fallback and ARIA wiring belong in `SearchOverlay.vue`. Worth a line in `docs/agent-ui-and-preview-conventions.md` for shared-overlay components.
- **A focus fallback needs a connected-check on every target it can return**, including caller-supplied refs, and must resolve after `setTimeout(0)` so pending navigation has run. This is a recurring Vue/SPA pitfall worth capturing in the UI conventions doc.
- **Combobox semantics**: bind `aria-expanded` to what is actually rendered (the popup), not the overlay's open state; keep empty/loading copy in a persistent `role="status"` node — dynamically inserted live regions announce unreliably.
- **Test-environment gotchas**: jsdom lacks `scrollIntoView` (stub it or use optional chaining); prop watchers don't fire on the initial value, so tests that depend on an open-triggered side effect must mount closed and then open; a router mock that never unmounts can't reproduce unmount bugs — model the detached caller directly.
- **Verify a review's claim against the code.** Round 3's named bug was already fixed in the reviewer's checkout discrepancy — the report's description was stale relative to HEAD. Candidate for a line in `docs/agent-workflow-rules.md`.
- **An explicit flag beats a nullable argument** whose meaning flips per branch (`restoreFocus` vs passing `null`).

## Follow-ups

None — no linked tasks were recorded.

Known loose ends that were **not** filed as tasks and remain open for a future reader: (1) the two read-only `docs/qa/*` records carry a stale empty-copy line and lack a #1269 section (need a human unlock or a follow-up edit); (2) the shot schema has no viewport field, so a declared shot can't pin 375 px — the WebKit three-width fixtures remain the width evidence; (3) the pre-existing `vue-tsc` failures in untouched components that made `bun run build` fail; (4) the palette shot's re-capture on the final tree is unrecorded, and its re-capture request was dropped at close-out; (5) result counts are not announced to screen readers (no live region for counts).

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
