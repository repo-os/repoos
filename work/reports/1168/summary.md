## TL;DR

Task #1168 was an end-to-end QA pass on two outward-facing flows: the Releases "Generate AI release notes and publish" chooser (#1126) and the update/restart modal for hand-run vs supervised servers (#1154). Driven entirely against a throwaway dev server with Playwright route stubs; no release was cut, published, pushed or tagged, and no real server was restarted. The pass found and fixed one real product defect — the restart notice's pluralization of active-work counts ("1 checks") — plus test coverage for it, and produced a permanent QA record (`docs/qa/2026-11-releases-and-restart-qa.md`) with 24 screenshots attached to the task. Review pass 1 returned `needs some work`; pass 2 returned `good to go`. The task landed on `main` as commit `2c645f40252ba299aae7c201719867c38c65d605` and is done.

## Outcome

What shipped:

- **A small product fix:** `src/ui-app/src/components/ReleaseUpdateNotification.vue` pluralized agent and check counts independently (previously both nouns were hardcoded plural, so the fixture with `checks: 1` rendered "2 agents and 1 checks running"). Table-driven component tests now cover the (2,1), (1,2), (1,1) and (0,0) combinations; the "0 agents and 0 checks running" wording is deliberately pinned.
- **A QA record** at `docs/qa/2026-11-releases-and-restart-qa.md`, rewritten in round 2 after the reviewer found discrepancies between the doc and the actual evidence (port, worktree, test counts, missing captures).
- **24 screenshots attached to the task** via `repoos update 1168 --screenshot`: the chooser (1440/390), both chooser choices, pending and reloaded Notify/Publish states, a failed draft, and the restart notice matrix — hand-run, launchd, systemd and uncertain-detection at 1440 and 390 widths in light and dark. All were individually inspected by the engineer.
- **End-to-end verdicts on the flows themselves:** the chooser copy names the exact tag and clearly separates automatic publish from "Notify me" (Notify never claims RepoOS will publish); pending Notify/Publish records survive a browser reload and their Cancel reaches the cancel endpoint; a failed draft publishes nothing; the hand-run notice shows a real "Restart now" action with a recorded-flags/port explanation, launchd/systemd show restart actions without shell commands, and the uncertain state shows an explicit manual command (now covered by a component test).

Final verdict: review pass 2 `good to go`; task closed out successfully (`release:success`) and marked done.

## Process stats

- **Wall clock, created → done:** 2026-11-18T00:17:51Z → 2026-11-18T03:29:54Z = 3 h 12 m 03 s.
- **Engineering rounds:** 2 (Round 1 at 00:57:59, Round 2 at 01:53:35), both `codex` on `gpt-6-luna`. One engineer session recorded: started 00:18:00, elapsed 4319 s (~72 m), 63,325,890 tokens; cost not recorded.
- **Review passes:** 2, both `opencode` / `opencode-go/deepseek-v4.1-flash`. Pass 1 (started 00:58:06, 563 s, 90,274 tokens, $0.033435126): `needs some work`. Pass 2 (started 01:53:39, 289 s, 86,621 tokens, $0.025174044): `good to go`. Reviewer totals (derived from the recorded per-session figures): 176,895 tokens, $0.05860917.
- **Routing sessions:** 2 (`openrouter` model router, model "unknown", 1 s and 4 s; no tokens or cost recorded).
- **Restarts/swaps:** no agent or model swap occurred. The watchdog restarted the engineer once early on (00:33:50) because a queued message waited 3 minutes with no live process.
- **Close-out gate:** completed in 771 s at 03:29:19.
- Status path: inbox → ready → active → review → active → review → done (one review bounce).

## What went wrong

- **Early delivery stall:** a queued message sat undelivered 3 minutes with no live engineer process; the CTO nudge held and the watchdog restarted the engineer (00:33:50), after which the message delivered. A second queued message at 00:47 prompted ending the first turn at 00:50:50 so it could be delivered — that turn exited without a handoff.
- **Round 1 turn also ended without a handoff** (01:28:22, exit code 0, did not request review); the engineer's last message said the scoped check had exposed an incorrect assertion in the new test. Work resumed in round 2.
- **Review pass 1 found a real defect the QA pass had certified as clean:** the pluralization bug in the restart notice, meaning the "no product defects found" claim and acceptance criterion 3 were unmet. It also flagged mid-transition dark-mode screenshots (taken before theme/dialog settles), missing 390px chooser captures, screenshots not attached to the task (both `.repoos` evidence dirs are gitignored), and doc-vs-transcript discrepancies (port 7278 vs 7371, test counts 39 vs 49+18). All resolved in round 2: fix + tests, re-captured settled shots, attached all 24 PNGs, rewrote the QA doc.
- **Harness/test-script issues (not product defects):** a direct `bunx vitest` run failed on Vite import analysis until rerun through `bun run test`; the first Cancel locator hit the panel's close button until scoped to the auto-publish card; the round-2 script mistook the panel's cached-only POST lookup for a new draft, manufacturing a false pending state, until it recognized `cachedOnly`; the first cancellation click was intercepted by the open drawer overlay until dispatched on the element itself; an over-broad assertion banning "Restart now" anywhere in the alert also matched valid explanatory copy and was narrowed to the button label; a formatting diff was caught by the check and fixed with the formatter.
- **Vacuous guard:** pass 2 noted the harness's `releaseMutationCalls` counter was never incremented, so the "zero release mutation calls" claim was overstated — the real no-release guarantee rests on `page.route('**/api/release/**')` interception, which held.
- **A message went overdue** at 02:55:13 (still queued after 60 m). Its explicit resolution is not recorded; the close-out gate completed at 03:29:19 and the task landed.
- The browser host tool was unavailable in round 1; Playwright (explicitly permitted by the task) was used instead.

## Learnings

- **Asymmetric fixture counts catch copy bugs symmetric ones hide.** The pluralization defect survived two engineers' screenshot reviews until a fixture combined 2 agents with 1 check. Worth a line in `docs/agent-ui-and-preview-conventions.md` when count-rendering components are tested.
- **Target assertions at the control, not at phrases.** Banning a string that also appears in valid explanatory copy produces false failures; assert on the button label/`data-test-id` instead.
- **Browser stubs must distinguish read-only cache lookups from user-triggered mutations.** Treating the panel's `cachedOnly` POST as a Generate action made the harness manufacture the exact disabled state it was investigating. Belongs in QA-harness guidance (`docs/qa/` or the preview/UI conventions doc).
- **Screenshot provenance must reconcile with the written record** — worktree, port, theme-transition settling, and what each filename encodes — and captures must be attached to the task, since `.repoos/` evidence dirs are gitignored and invisible to the human reviewer.
- **A mutation-guard counter that is never incremented proves nothing.** Either wire it up or drop the claim; the route-interception guarantee is what actually held.
- The task-specific QA findings and evidence index live in `docs/qa/2026-11-releases-and-restart-qa.md`.

## Follow-ups

None — no linked tasks were recorded for this task. (Two reviewer suggestions were left as suggestions, not filed tasks: make the harness mutation guard real or drop the counter claim from the QA doc, and optionally capture the dark chooser and 390px Publish states to complete the matrix.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
