---
task: "1271"
pass: 1
at: "2026-11-20T06:27:55.895Z"
agent: reviewer
cli: opencode
model: opencode-go/glm-5.3-flash
branch: feat/qa-pass-projects-switcher-and-server-pic
state: ok
tree_identity: "7da9799f8:"
---
## Verdict

`good to go` — Minimal, correct fix; the focus-ring class is a singleton in `mobile/src`.

## Relevance

`still relevant` — The QA premise holds: text fields in the Hub picker dropped their outline and kept only a 1px border colour shift as the focus cue, which is a real accessibility defect worth landing.

## Evidence

None

## Bugs

None found

`No further findings of this class were found after grepping: mobile/src/style.css (all `outline` rules — only this one `outline: none`), mobile/src/*.vue (`.field` usages: AddServerView inputs, App.vue sheet input, SettingsView selects — selects/buttons never drop their outline), src/ui-app/tests/mobile-hub-picker-layout.test.ts (sibling CSS-text assertions), package.json/justfile/shebangs (no new `node`/`npm`/`npx` invocations), work/1271 task file (no Shots declared — correct for a non-web-route mobile app).`

## Edge cases

- `.field input:focus` covers only `<input>`; SettingsView's `<select>` elements and all buttons keep native `:focus-visible` outlines (no other `outline: none` in `mobile/src/style.css`), so the class has no unfixed siblings.
- The `--ring, --primary, --cyan` fallback chain matches the pre-existing `border-color` line, so both declarations resolve identically in both themes.
- The new test's `ruleBody` regex escapes the `:` in `.field input:focus` correctly and pins both `outline: none` and the ring; it is a CSS-text check like the rest of that file, appropriate since jsdom can't compute focus styles.
- Merge with main conflicts only in this task's own `work/1271-*.md` (server checklist WARN; close-out takes main's copy) — no source-file conflict.
- Report source commit `77e1098b` matches the reviewed implementation tree (later commits are report/task bookkeeping only).

## Suggestions

None.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

