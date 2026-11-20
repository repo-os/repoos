---
task: "1255"
pass: 4
at: "2026-11-20T00:57:47.081Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-update-banner-version-display-an
state: ok
tree_identity: "7277549d6:bde1aa6c5b"
---
## Verdict

`needs some work` — the td/guide marker fix and supervised waiting-row fix are real, but the rewritten guard test silently stopped covering two surfaces, and the handoff captures are stale for HEAD.

## Relevance

`still relevant` — the QA premise (banner, version display, release modal, markers) holds; rounds 1–3 findings are now fixed in code.

## Evidence

None — the three handoff captures were taken on tree `bde1aa6c5b`, but HEAD is `7277549d6`; the supervised waiting line gained `release-update-status` (own flex row), which changes the notice layout shown in shots 2 and 3, so re-capture on the final tree is required.

## Bugs

- **Class: guard-test-coverage-gap (scan misses computed v-html sites)** — `src/ui-app/tests/markdown-list-markers.test.ts` matches only `v-html="render(Chat)?Markdown(...)"` written literally in the template, so it finds the 6 direct call sites (playground, CTO, debugger, PM, task-debugger, guide) but **not** the surfaces whose HTML goes through computed properties: `.md-rendered` (StoryPanel, TaskDrawer ×3, ContextView ×2, InputsView) and `.release-update-markdown` (ReleaseUpdateNotification). The round-2 static `MARKDOWN_SURFACES` table guarded these two container classes; the rewrite dropped that guard, so removing `.md-rendered ul`/`.release-update-markdown ul` from the shared rule now fails no test. The same overstatement is written twice as fact: the `style.css` comment ("scans every v-html renderMarkdown()/renderChatMarkdown() site") and `docs/qa/2026-11-update-banner-qa.md` §4 ("a new surface without a rule fails the test") — both false for computed-property surfaces.
- Grep confirms no other test covers `.md-rendered` or `.release-update-markdown` list-style.

No further findings of this class were found after grepping: all `v-html` render sites in `src/ui-app/src` (direct and computed), the `MARKDOWN_SURFACES`/scan test history, the shared rule selector list in `style.css`, the QA doc surface list, `releases.test.ts` for `.release-update-markdown` guards, and `measure-update-banner.mjs` (shebang `bun`, no bare `node`/`npm`/`npx`).

## Edge cases

- The scan keys by file+tag, so two direct v-html sites on the same tag in one file would overwrite each other in the map (none today).
- Real hand-run restart stays fixture-only by design (honestly recorded) — human follow-up.

## Suggestions

- Restore static enforcement for `md-rendered` and `release-update-markdown` alongside the scan, or have the scan also match `v-html="…Html"`/computed names via a renderMarkdown call in the file; fix the "The The" typo in the QA doc.
- Re-capture the three shots on HEAD before sign-off.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T00:16:09.847Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

