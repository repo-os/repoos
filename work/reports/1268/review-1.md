---
task: "1268"
pass: 1
at: "2026-11-20T06:04:52.903Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-stories-and-docs-pages-reading-e
state: ok
tree_identity: "7a5d62136:7f52781553"
---
All checks done. Writing the report.

## Verdict
`needs some work` — the diff itself is sound, but the declared shot shows a real, unfixed layout defect on the page under QA: wrapped list items render as outdented stray paragraphs.

## Relevance
`still relevant` — no open or landed task fixes this; #1237/#1238 covered other surfaces, and the Docs/Stories reading experience still needs this sweep.

## Evidence
None

## Bugs
- **Class: Markdown block continuation splitting** — `src/ui-app/src/lib/markdown.ts` `parseBlocks()`: the `ul` loop (line ~334) and `ol` loop (~350) only consume lines matching their marker regex, so an indented continuation line of a list item ends the list and becomes a standalone `<p>`. Wrapped bullets read as one broken sentence split by an outdented unmarked paragraph at the container's left edge (past the hanging indent). I reproduced it: `- **Dropdowns:** … for every new\n  dropdown in the UI…` renders as `</ul><p>  dropdown in the UI…</p><ul>…`. This is visible in the handoff capture (`default-1.png`) of the exact doc the declared shot targets — both the Dropdowns and Confirmations bullets show outdented continuations. It hits every `parseBlocks` consumer: the Docs reader (ContextView), StoryPanel (Stories detail), TaskDrawer spec/report rendering, PmChatSurface, DebuggerChat, TaskDebuggerChat, CTOPanel, RepoGuideChat, ModelPlaygroundPanel, ReleaseUpdateNotification, InputsView — both `renderMarkdown` and `renderChatMarkdown`. The blockquote loop (~328) has the same defect for CommonMark lazy continuation: a non-`>` line silently ends the quote and renders outside the `<blockquote>`. The QA sweep's own criterion is "every issue found is fixed, covering the whole class" — this one is on the declared screenshot and was not found.

No further findings of this class were found after grepping: markdown.ts block loops (ul/ol/blockquote/paragraph gather), all renderMarkdown/renderChatMarkdown callers listed above, markdown.test.ts, markdown-list-markers.test.ts, and the `.md-rendered` list CSS in style.css.

## Edge cases
- Nested lists: an indented sub-bullet matches the same regex and flattens into a sibling item, losing nesting (same parser, same class).
- Task-checkbox items (`- [x]`) with wrapped text.
- Loose lists with blank lines between items become multiple `<ul>`s (extra spacing).

## Suggestions
- `docs-reader-qa-browser.test.ts` reads the global stylesheet from `dist/`, so a stale build makes it validate old CSS silently; consider failing or warning when `dist` predates `src/style.css`.
- `var(--warn, var(--amber))` in ScheduledTasksPanel is fine, but `--warn` remains permanently undeclared (fallback reads are exempt from the new guard); consider dropping the dead first leg.

## Verdict
`needs some work`

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-20T06:01:09.559Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

