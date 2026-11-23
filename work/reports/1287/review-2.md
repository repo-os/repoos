---
task: "1287"
pass: 2
at: "2026-11-23T09:53:48.093Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/polish-automated-release-announcement-em
state: ok
tree_identity: "f8aeb3b31:"
---
## Verdict

`needs some work` — Bullet-style notes still build Highlights with `rest || first`, so multi-sentence bullets break the one-sentence bar and can mislabel content.

## Relevance

`still relevant` — Subject/header rework, skim summary, and stored per-version copy address a real problem without new LLM calls or send-path throws.

## Evidence

None

## Bugs

- **Class: summary detail truncation** — `src/server/release-email.ts` (`noteItems` → `add`, `isBullet === true`): `detail` is `rest || first`, so a bullet like `Fix boot. Also improves recovery.` yields name `Fix boot` but detail `Also improves recovery.`; longer bullets can surface trailing sentences in Highlights/TL;DR. Paragraph + heading path correctly uses `first` only (pass 1 fixed); v0.5.93 sample is paragraph-shaped so it masks this for the checked-in fixture.

No further findings of this class were found after grepping: `noteItems`, `summarizeReleaseNotes`, `renderReleaseEmail` HTML/text highlight branches, `recordFor`/`sendAndRecord`/`previewReleaseEmail`, `release-email.test.ts`, sample fixtures, branch diff for bare `node`/`npm`/`npx`.

## Edge cases

Review pass 1’s paragraph highlight issue is fixed on HEAD `f8aeb3b`; engineering report predates that commit. Server preflight: task-file-only merge conflict; review lock unset (bookkeeping). Default fixture notes use `### Features` bullets—subject/headline paths depend on the bullet branch. Deterministic summary cannot throw; empty notes omit headline/TL;DR. Summary frozen on first `release-emails.json` write per version.

## Suggestions

Use `first` as bullet `detail` (same as paragraphs), with a bullet test for two-sentence lines. TL;DR’s `Name: sentence` repetition is awkward but acceptable. Gmail fidelity remains sample-only; optional human inbox check.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

