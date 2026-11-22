## TL;DR

Task 1268 swept the Docs reader and doc tree for reading-experience bugs at 375, 768 and 1280 px, headlessly (Playwright/WebKit on fixtures, never a visible browser). The sweep found inline code overflowing at mobile width, non-keyboard-reachable tree rows, a one-letter-per-line doc title at 375 px, a literal `\n` printed in the Skills.sh template, and a class-wide cause: undeclared CSS custom properties. Round 2 then fixed a shared-markdown-parser defect the reviewer found — wrapped list items and blockquote lazy continuations splitting into stray paragraphs — which affected every markdown consumer in the app. Two engineering rounds, two review passes; verdict went from `needs some work` to `good to go`, and the task closed out successfully (release:success).

## Outcome

What shipped:

- **Docs reader fixes** (`ContextView.vue`, `style.css`): inline code now wraps instead of running off-screen at 375 px; doc-tree rows and Skills rows became `<button>` elements (keyboard-reachable, with `:focus-visible` rings and `aria-expanded` on folders); the doc title header wraps and takes free width at narrow widths.
- **Template fix**: the Skills.sh file review no longer prints a literal `\n` (text node replaced with `{{ "\n" }}`).
- **CSS token aliases**: eleven undeclared custom properties (`--bg-overlay`, `--bg-accent-soft`, `--bg-elev`, `--surface-1`, `--surface-2`, `--info`, `--info-alpha`, `--red-alpha`, `--focus`, `--yellow`, `--warning`) silently computed to nothing; they were aliased to matching existing tokens (round 2 later removed the `--warning`/`--yellow` aliases where reads had designed fallbacks, pointing those reads at `--amber` directly).
- **Class-wide guards**: new `css-var-declared.test.ts` fails on any `var(--name)` read with no fallback where the name is undeclared anywhere; `template-text-newline.test.ts` fails on any SFC text node containing a literal backslash-n.
- **Shared markdown parser fix** (`src/ui-app/src/lib/markdown.ts`): `parseBlocks` ended list items at their first unmarked line, so wrapped bullets rendered as outdented stray paragraphs; blockquote lazy continuations were cut short too. List items now gather indented bodies plus CommonMark lazy continuation lines, nested sub-lists stay nested, and loose lists render as one `ul`/`ol`. A progress guard prevents the paragraph loop from consuming nothing. Every consumer of `renderMarkdown` and `renderChatMarkdown` benefits (Docs reader, StoryPanel, TaskDrawer, PmChatSurface, DebuggerChat, TaskDebuggerChat, CTOPanel, RepoGuideChat, ModelPlaygroundPanel, ReleaseUpdateNotification, InputsView).
- **Headless coverage**: `docs-reader-qa-browser.test.ts` mounts the real `ContextView` in headless WebKit at all three widths (overflow, clipping, link liveness, title width, keyboard focus ring); `markdown-list-continuation.test.ts` pins the continuation behaviour.

The final review verdict was `good to go` (pass 2), the close-out gate completed, and the task ended `done` with `release:success` (merged commit `414135a1abd92ae2d0c6d4a95758903dffce5267`).

## Process stats

- **Dev rounds:** 2 engineering rounds (both claude code · haiku).
- **Review passes:** 2 (both opencode · opencode-go/glm-5.3-flash). Pass 1: `needs some work`; pass 2: `good to go`.
- **Wall-clock, start to done:** created 2026-11-20T05:07:07Z, done 2026-11-20T11:36:47Z — 6 h 29 m 40 s.
- **Engineer session:** haiku, started 2026-11-20T05:08:43Z, elapsed 4788 s, 112,040 tokens, cost 3.4512120400000006 (currency units as recorded; presumably USD), finished.
- **Reviewer sessions:** glm-5.3-flash; pass 1 elapsed 218 s, 64,945 tokens, cost 0.03964307000000001; pass 2 elapsed 275 s, 75,411 tokens, cost 0.04326418. Both finished.
- **Restarts or model swaps:** none recorded.
- **Recorded token total:** 112,040 + 64,945 + 75,411 = 252,396 across the three sessions.
- **Recorded cost total:** 3.4512120400000006 + 0.03964307000000001 + 0.04326418 = 3.53411929 (sum of the recorded figures).

## What went wrong

- **Queued-message handoff gate (05:47):** the first handoff was deferred because an undelivered queued message had to be read first; the engineer turn also ended without a handoff ("exited cleanly and did not request review"). Resolved by resuming the engineer to read the queued messages, after which the handoff proceeded. A second queued message sent at 05:47:27 was never delivered — it was flagged overdue at 07:46:52 and finally dropped at 11:34:23 when the task finished ("1 queued message(s) discarded — task is done"). Its content is not recorded here.
- **First UI verification failed (05:51):** the declared shot highlighted `.tree-file.sel`, which is inside a collapsed folder on that route and matched nothing. Fixed in round 2 by re-declaring the shot to highlight `.doc-title`, which renders once a document is open. Verification then passed (06:01 and 06:46).
- **Stale `dist/` stylesheet:** the first fixture run failed at 375 and 768 px on inline code even after the CSS edit, because the fixture loads the built global stylesheet from `dist/`, which predated the change. Resolved by running `bun run build:ui`. The round-2 test now throws when the built stylesheet is older than `src/style.css` so a stale build fails loudly.
- **First `repoos check` failed `check-fmt`** on the new test file; `bun run fmt` fixed it and the rerun passed.
- **Round-2 check timeout (engineer-side):** a `repoos check` run hit the engineer's own 590-second timeout while browser tests were still running — a timeout on the agent's side, not a check failure. Resolved by rerunning the check in the background to completion.
- **Review round 1 (`needs some work`):** the reviewer found a real defect the sweep had missed — the shared markdown parser splitting wrapped list items and blockquote lazy lines, visible in the declared shot's own target doc — plus two suggestions (stale-dist guard, dead `--warn` leg). All were fixed in round 2; round 2 was verified `good to go`.
- **CTO nudges held four times** (05:17, 05:47:40, 05:59, 06:46) — each for a legitimate in-flight reason (queued message, handoff gate running); no action needed.
- **Engineer-side flake:** `repoos check` locally skipped its unit `tests` step (remote validation runs them), so the engineer ran the affected suites directly (14 + 111 + 36 + 2 + 43 + 49 + 91 tests across the listed suites, plus the new guards); all passed.

## Learnings

- **Layout bugs can pass an overflow audit.** The one-letter title column didn't overflow anything — it was found by reading the screenshot. Keep a screenshot in the loop for text-heavy pages.
- **A class-wide fix needs a guard, or the class returns.** The alias block plus `css-var-declared.test.ts` pins the CSS-token class; the AST text check pins template text. This pattern (table-free guard tests for whole bug classes) is worth a line in `docs/agent-ui-and-preview-conventions.md`.
- **A stale build silently validates old CSS.** Fixture tests that load `dist/` must fail loudly when the build predates the source; the stale-dist throw in `docs-reader-qa-browser.test.ts` is the mechanism here.
- **An alias that matches the name but not the intent silently replaces a designed fallback.** Before aliasing an undeclared token, check whether existing reads pass a fallback in `var()` — those fallbacks are design decisions. Worth a bullet in `docs/agent-ui-and-preview-conventions.md` or a note near the token definitions in `style.css`.
- **A parser change correct for one consumer can break several.** Check every `renderMarkdown`/`renderChatMarkdown` consumer's suite, not just one file.
- **Scoped button resets can out-specify existing hover/selected styles.** Row-conversion resets for shared row classes belong in the global block, not a component's scoped styles.

## Follow-ups

None.

<!-- repoos:generated-changes -->
## Changed files

- No changed files.
