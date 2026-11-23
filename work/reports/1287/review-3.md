---
task: "1287"
pass: 3
at: "2026-11-23T11:33:59.291Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/polish-automated-release-announcement-em
state: ok
tree_identity: "b5fb0ce3b:"
---
## Verdict

`needs some work` — Bullet highlights still use the second sentence as `detail`, so multi-sentence list items break the one-sentence bar (pass 2 unfixed on `b5fb0ce3`).

## Relevance

`still relevant` — Publish-prefixed subjects and missing skim layers are still real; deterministic summaries and per-version storage match the spec without new LLM calls.

## Evidence

None

## Bugs

- **Class: summary detail truncation** — `src/server/release-email.ts` (`noteItems` → `add`, `isBullet === true`): `detail` is `rest ? splitSentence(rest).first : first`, so `- Fix boot. Also improves recovery.` yields name `Fix boot` but detail `Also improves recovery.` instead of the opening sentence; TL;DR/Highlights then misstate the bullet. `src/ui-app/tests/release-email.test.ts` asserts this shape, so the regression is locked in. Paragraph + heading path correctly uses `first` only (pass 1 fixed).

No further findings of this class were found after grepping: `noteItems`, `summarizeReleaseNotes`, `renderReleaseEmail` HTML/text branches, `recordFor`/`sendAndRecord`/`previewReleaseEmail`, `release-email.test.ts`, `docs/release-email-samples/*`, branch diff for bare `node`/`npm`/`npx`.

## Edge cases

Pass 1 paragraph-highlight fix holds on HEAD; v0.5.93 samples are paragraph-shaped. Post–pass-2 commit only tightened bullet `detail` logic and added the locking test. Engineering report predates `b5fb0ce3`. `summarizeReleaseNotes` stops TL;DR at two sentences (spec allows 2–3). Summary frozen on first `release-emails.json` write. Server preflight: task-file-only merge conflict; review lock unset.

## Suggestions

Use `first` as bullet `detail` (match paragraph path) and invert the new test expectation. TL;DR `Name: sentence` duplication is awkward but acceptable. Gmail fidelity remains sample-only.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

