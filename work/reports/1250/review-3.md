---
task: "1250"
pass: 3
at: "2026-11-19T22:26:00.191Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-hub-macos-and-web-shared-strings
state: ok
tree_identity: "048699f93:048699f93d"
---
## Verdict
`good to go` — Round-2 blocker verified fixed; the guard's scan is quote-aware end to end and all 18 of its cases pass.

## Relevance
`still relevant` — the title-stripping defect in `tooltip.ts` is real, the five named controls now carry `aria-label`, and the audit doc is committed; nothing on main supersedes it.

## Evidence
None

## Bugs
None found

No further findings of this class were found after grepping: the round-2 quote-blind body regex (now `TAG_BODY`-based for open tag, child-tag strip and `<img>` alike), residual quote-blind tag regexes in `src/ui-app` tests (`syntax-highlight`, `toml-highlight`, `search`, `ai-chat-standard` — test helpers on known-generated spans, not the ratchet), `v-bind` exemptions, `title`-only icon controls remaining under `src/ui-app/src`, the pinned `aria-label` strings in the five touched components, old "Open the full-screen diff view" wording, and `repoos.toml` (untouched, per the task's Note).

## Edge cases
- Round-2 finding verified fixed: `TAG_BODY` is now used for the control's open tag, the body child-tag cleanup and `<img>` matching, with fixtures for `>` inside a child `v-if`, a child `:class` ternary and a child `<img v-if>`. I ran the single guard file (`bunx vitest run`, scoped): 18/18 pass.
- The guard still can't evaluate computed names (a named child-component wrapper slips past) and treats any `{{ … }}` interpolation as a name — both are ratchet limitations the audit states plainly, not defects in this pass.
- The auto capture (home route, tree 048699f93d, only bookkeeping changed since) renders correctly; an attribute-only diff is inherently invisible to a screenshot, so it neither proves nor contradicts the change. Console log clean at capture time.
- Merge with main: only this task's own `work/1250-*.md` conflicts; the server-resolved checklist already handles it from main.
- Acceptance criteria met: scans done, real defects fixed with a test, no visible browser opened, audit doc committed, `repoos.toml` untouched.

## Suggestions
- None found.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-19T22:25:09.855Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

