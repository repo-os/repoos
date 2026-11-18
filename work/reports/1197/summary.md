## TL;DR

Task 1197 was a QA pass over every Settings tab, control and dialog at phone width (375px). A single engineering round found the phone layout broadly sound and one real defect: in the Support tab, the long “Generate editable bug report with AI” action overflowed the padded action row at 375px (button ~279px in a 261px content box). The fix adds a wrapping rule for the Support action buttons at the existing mobile breakpoint, covered by a new WebKit regression test, plus the QA record `docs/qa/2026-11-settings-mobile.md`. Review passed first time (good to go) and the task closed out cleanly in one round.

## Outcome

Shipped on branch `feat/qa-pass-settings-tabs-on-phone-widths-ev`, merged as commit `08951db317bd3d469b0e37b29df2d2ed80f8a24e`:

- A scoped CSS fix in `src/ui-app/src/style.css` (+5/−0): at the existing phone breakpoint, the Support action buttons may shrink to the row width and their labels wrap, so the long AI-report action no longer crosses the card's inner edge at 375px. Desktop button sizing and other Settings controls are unaffected.
- A WebKit regression test, `src/ui-app/tests/settings-mobile-support-actions.test.ts` (+79), that builds a 375px layout with the Support action styling and asserts no horizontal page overflow, both buttons inside the row, and the long label wrapping.
- The QA record `docs/qa/2026-11-settings-mobile.md` (+37): method, measurements, the finding and the regression coverage.

The pass covered all seven Settings tabs at 375 × 844 using headless WebKit against the auth-less dev server (`just serve-noauth` from the task worktree), plus the search overlay, General/Security select menus, the Support manual report flow and screenshot viewer, and the Advanced development-target editor. Interactions were limited to opening and dismissing UI — nothing was saved or submitted. The TOML code editor's long lines use its own internal editor scrolling and were deliberately left intact; they do not widen the Settings page. Final verdict: review pass 1 returned **good to go**, the close-out gate completed, and status ended as done (`release:success`).

## Process stats

- **Created → done:** 2026-11-18T19:24:03Z → 2026-11-18T19:53:11Z, i.e. 29 minutes 8 seconds wall-clock.
- **Engineering rounds:** 1 (round 1, handed off at 19:43:17Z). No restarts or model swaps recorded.
- **Review rounds:** 1, verdict good to go (2026-11-18T19:43:59Z).
- **Engineer:** agent `codex`, model `gpt-6-luna` — session elapsed 1020s, 4,526,621 tokens, cost not recorded.
- **Reviewer:** agent `reviewer`, model `gpt-6-luna` — elapsed 40s, 203,119 tokens, cost not recorded.
- **Routing sessions:** 2 via the Model router (openrouter), model "unknown", 1s and 0s.
- **Close-out gate:** completed in 106s (19:52:40Z), status done at 19:53:11Z.
- **Total token count:** 4,526,621 + 203,119 = 4,729,740 across the engineer and reviewer sessions; combined cost not recorded.

## What went wrong

- **oxfmt failure on the first scoped check.** The first `REPOOS_CHECK_CHANGED=main repoos check` reported only a formatting failure in the new test file. Resolved by running `bun run fmt` and repeating the full scoped check, which then passed (build, changed-path tests, isolated boot-timing tests, browser smoke, formatting/lint, CSS guards and the rendered contrast audit all green).
- **Worktree-boundary crossing via the board CLI.** While declaring the review capture, `repoos update 1197 --shots` warned that it reads the main checkout's board even though it was run from the task worktree. The engineer stopped using board commands and did not inspect the main checkout further; the handoff capture itself was validated by the server, and close-out resolved the expected own-task-file conflict from main. No action needed beyond the note.

No crashes, stalls, failed handoffs, flaky checks or reviewer restarts occurred.

## Learnings

- **The Settings phone layout is broadly sound**, including portal-based menus and overlays; a single localized defect was found. Worth recording alongside the existing mobile QA notes in `docs/qa/`.
- **Flex wrapping alone doesn't fix intrinsic-width overflow in button rows:** while a child retains a single-line label and its automatic minimum width, the row still overflows. The fix pattern — constrain the button to the row width and allow label wrapping at the mobile breakpoint — is durable guidance for future phone-width fixes and belongs in `docs/agent-ui-and-preview-conventions.md` if a phone-width section exists there.
- **Distinguish page overflow from an editor's internal scroll:** the TOML code editor's long lines are contained by its own scrolling and are not page defects; measuring document width separately from per-tab controls was the method that made this call. Captured in the committed QA doc `docs/qa/2026-11-settings-mobile.md`.
- **A tab can fit while a portal does not:** dialogs, menus and overlays were checked separately from their parent tabs — a checklist item worth keeping for future width QA passes (candidate for the QA docs convention).

## Follow-ups

None. No linked tasks were recorded and no new tasks were filed from this work.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
