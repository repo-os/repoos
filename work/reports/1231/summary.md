## TL;DR

Task #1231 shipped a QA pass over the web UI's keyboard shortcuts and command palette. The engineer inventoried every window/document keydown listener, then fixed seven real defects: an Escape leak out of the command palette into window-level handlers behind it, the same leak in the copy-inspector popup's capture-phase listener (found in review), a z-index tie that let an open drawer cover the palette, three dead `:focus-visible` rings caused by an undefined `--focus-ring` custom property, nine more undeclared CSS custom tokens silently killing text/border/shadow styles (found in review), a missing focus indicator on the palette's close button, and an undocumented palette-vs-confirm-modal stacking that was pinned as deliberate modality. Two regression suites (29 jsdom tests + 4 WebKit fixture audits at 375/768/1280 px) and `docs/qa/2026-11-keyboard-shortcuts-qa.md` lock it all down. Final verdict: **good to go** on review pass 3; task closed as done with `release:success`. The run was noisy — one agent fallback, three crash-recovery resumes, two failed finalizations over a report-format gate, and three browser-capture verification failures (two of them a loading-veil timing flake) — all resolved without losing work.

## Outcome

Shipped on branch `feat/qa-pass-keyboard-shortcuts-and-command-p`, merged as commit `0f8e0e9b7273c98b943f61f9e7274f31c3ba6835`:

- **Full shortcut inventory** verified rather than re-documented: ⌘K/Ctrl+K palette (global plus scoped repo/settings palettes), the palette's arrow/Enter/Esc/Tab trap, the opt-in board navigation keys (j/k/h/l/arrows/Enter/two-stage Esc), settings roving tabs, Enter-to-send composers, ⌘/Ctrl+Enter submits, and the drawer's Esc path. Touch behavior and discoverability (kbd chips, palette legend, Settings row, mobile Search tab) were confirmed already correct from #1139/#1152.
- **Escape consumption fixed at the source:** one `stopPropagation()` in `SearchOverlay.onKey` stops one Esc from closing both the palette and, e.g., an open task drawer behind it — the pattern AreaPicker already used. The copy-inspector popup's capture-phase window listener (which fires before any bubble handler, so `stopPropagation` could never reach it) now consumes the Escape it acts on.
- **Stacking ladder made deliberate:** the palette moved from z-index 100 (tied with drawers) to 160 — above drawers (100), jump-to-latest (130) and shot viewer (140/150), below tooltip (200), card preview (300) and confirm modals (1000/12000) — with the ladder documented in a comment and pinned by CSS-parsing tests.
- **Silent CSS failures fixed:** three rules referencing the never-defined `--focus-ring` now use `--ring`; the palette close button got a visible focus ring; and a stylesheet-wide guard for fallback-less `var()` references flushed out nine more undeclared tokens (`--txt-muted`, `--txt-secondary`, `--txt-primary`, `--bg-secondary`, `--border-focus`, `--cyan-border-tint`, `--cyan-tint`, `--shadow-lg`, `--mono`), which are now declared once at `:root` as theme-aware aliases rather than patched at ~50 call sites.
- **Regression coverage:** `keyboard-shortcuts-qa.test.ts` (29 jsdom tests, up from 26 in round 1) and `keyboard-shortcuts-qa-browser.test.ts` (4 WebKit fixture audits at 375/768/1280 px), plus the committed QA write-up `docs/qa/2026-11-keyboard-shortcuts-qa.md`. No `repoos.toml` change, no runtime dependency, `dist/` untouched, per the task constraints.

**Final verdict:** review pass 3 returned `good to go` (its only caveat was stale-evidence-only: the handoff captures predated a final docs+test-only commit, with no UI source change). Reviewer passes 1 and 2 returned `needs some work`; the code-level findings from both were fixed and verified in later rounds.

## Process stats

- **Wall-clock, creation → done:** 2026-11-19T13:47:53Z → 16:52:39Z — 3 h 4 m 46 s. First review request at 15:11:27Z (~1 h 24 m in); most of the remaining time went to two review bounces and flaky browser-capture verification. The close-out gate alone took 569 s.
- **Engineering rounds:** 2 recorded rounds (round 2 was the review-feedback round).
- **Review passes:** 3 — pass 1 `needs some work` (capture-phase Esc leak + edge cases), pass 2 `needs some work` clamped by automated verification (loading-veil shot failure; reviewer's own narrative verdict was good-to-go, evidence-gap-only), pass 3 `good to go`.
- **Agents and models:** fallback at dispatch — codex + gpt-6-luna was paused (provider usage limit, out of usage since 2026-11-19T07:09:32Z), so the task ran on **opencode + opencode-go/glm-5.3-flash** for both roles. No mid-run model swaps.
- **Engineer sessions:** 1 recorded session, 1704 s elapsed, 457,631 tokens, $0.14569878. Around it: 3 crash-recovery resumes (each marked 1/3 crashes in 30 m), 2 watchdog auto-resumes (1/3 and 2/3, one of which failed because a live engineer pid was already recorded), and 3 watchdog restarts (10 m with no live process; queued message waiting 3 m twice). Four orphaned processes were stopped (engineer pids 91332, 35882, 78856; run process pid 22268).
- **Reviewer sessions:** 3, all opencode + opencode-go/glm-5.3-flash — 208 s / 63,086 tokens / $0.03900013; 177 s / 50,765 tokens / $0.0173332; 172 s / 63,601 tokens / $0.03172756.
- **Routing sessions:** 10 model-router runs, 0 s each, model/tokens/cost not recorded.
- **Recorded token and cost totals** (sum of the four finished agent sessions above): 635,083 tokens, $0.23375967. Routing sessions carried no figures.

## What went wrong

- **Provider quota at dispatch:** the preferred codex + gpt-6-luna pair was paused out of usage; the router fell back to opencode + glm-5.3-flash. No action needed beyond the fallback.
- **Three agent crashes/exits with error**, each resolved by crash recovery resuming the same worktree (14:04:52, 14:51:59, 15:49:38).
- **Two failed finalizations with the same gate error:** "Engineering report must begin with ## TL;DR; remove any text before it" (14:51:59 and 15:49:38). Both were recovered by resuming the worktree; the second handoff was then requested via CLI. This cost roughly an hour of watchdog churn around two otherwise-complete work products.
- **Watchdog/heartbeat noise:** an auto-resume was refused at 14:18:13 because a live engineer (pid 12272) was still recorded; restarts fired at 14:37:27, 14:47:57 and 15:48:12, the latter two because queued messages sat undelivered for 3 m with no live process. At 16:27:13 a turn was ended (exit code 130) specifically so a queued message could be delivered; the handoff was then requested via CLI and proceeded.
- **Browser-capture verification failures, three of them:** 15:37:10 and 16:01:00 recorded `missing-target` because the page was still under its `[aria-busy]` loading veil at capture (`/work` then `/`); at 16:35:36 the shots step failed outright ("browser capture cancelled" / timed out waiting for the capture). The two veil failures were judged a capture-timing flake, not an app defect — the same `/work` shot passed at 15:45 and both declared shots captured clean at 16:13. The 16:35 cancellation was overtaken by events: review pass 3 had already returned good-to-go moments before, and close-out completed. One handoff attempt failed at verify for each of the first two veil failures.
- **Review-driven rework (expected, not a fault):** pass 1 found the capture-phase copy-inspector Esc leak and widened the variable guard; pass 2's only blocking issue was the evidence gap above.

## Learnings

- **When a floating layer consumes a key, consume it completely.** `preventDefault` stops the default action but not sibling window-level listeners; a capture-phase listener must consume its own keys because no later handler can suppress anything for it. The repo already knew the bubble-phase pattern (AreaPicker's `stopPropagation`, StopWorkConfirmModal's open-stack guard) — the palette and copy inspector were the odd ones out. Worth a line in `docs/agent-ui-and-preview-conventions.md` so the next overlay author copies the pattern.
- **CSS custom properties fail silently:** `var(--undefined)` computes to inherit/initial with no console warning, so dead tokens look like subtle design drift. The stylesheet-wide guard for fallback-less `var()` references added in this task is cheap insurance and caught ten undeclared tokens, not the one that led there.
- **Platform behavior differs where you least expect it:** headless macOS WebKit skips buttons on Tab unless Full Keyboard Access is on. Keep app trap logic in jsdom and browser fixtures for layout/visual evidence — the repo's existing split (per `dialog-overlay-browser.test.ts`) is the right one.
- **Bare `bunx vitest` doesn't load the Vue plugin** — tests must run through `bun run test:vitest`. Minor, but it cost a false start here and will again.
- **Process learning:** the `## TL;DR`-first report gate rejected two finalized runs because text preceded the heading. The engineering-report format contract is already stated in the task-runner loop; a pre-finalization format self-check by agents (or a lint step) would avoid burning a full finalization cycle on it. Candidate for `docs/agent-workflow-rules.md`.

## Follow-ups

None — no linked tasks were recorded. (Reviewer suggestions not filed as tasks, for the record: re-capture the two declared shots on the final tree so evidence matches HEAD, and consider a drawer-open state fixture if a re-capture ever happens. Pass 3 confirmed both shots render correctly; only tree identity was stale, and the delta was docs + one test.)

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
