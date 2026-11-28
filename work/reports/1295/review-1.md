---
task: "1295"
pass: 1
at: "2026-11-28T00:12:50.165Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/attach-the-mac-hub-dmg-to-releases-witho
state: ok
tree_identity: "c7cae2666:"
---
## Verdict

`good to go` — Workflow, docs, and tests match the acceptance criteria; no blocking defects found.

## Relevance

`still relevant` — Stable tags still need an attachable un-notarized DMG until Apple credentials land; this branch fixes that gap.

## Evidence

None

## Bugs

None found

No further findings of this class were found after grepping: `.github/workflows/macos-hub.yml`, `src/ui-app/tests/hub-workflows.test.ts`, `docs/macos-hub-release.md`, `user-docs/macos-hub.md`, `user-docs/android-hub.md`, repo-wide `older release` / `latest/download` fallback claims, branch diff for bare `node`/`npm`/`npx`.

## Edge cases

- Dropping the entire `push.paths` filter fixes tag releases but also runs `build-and-test` on every `main` push, not only `macos/**` changes (release job remains tag/dispatch-gated).
- No live tag publish or Apple notary run was exercised; behaviour is asserted via workflow YAML and string tests only.
- A single non-empty secret (including accidental whitespace) forces the credentialed fail-closed path instead of the all-empty upload path.

## Suggestions

- If macOS Hub CI cost on unrelated `main` commits becomes noisy, a follow-up could split tag release triggers from path-scoped main builds (GitHub cannot path-filter tags separately within one `push` block).

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

