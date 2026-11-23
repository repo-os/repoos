---
task: "1287"
pass: 1
at: "2026-11-23T09:37:29.924Z"
agent: reviewer
cli: cursor
model: composer-2.5
branch: feat/polish-automated-release-announcement-em
state: ok
tree_identity: "7582efa8e:"
---
## Verdict

`needs some work` — Highlights for paragraph-style notes reuse full section bodies, so they fail the one-sentence acceptance bar and mirror Full release notes.

## Relevance

`still relevant` — The Publish-prefixed subject and missing skim layer are real; this branch addresses them without extra LLM calls or send-path risk.

## Evidence

None

## Bugs

- **Class: summary detail truncation** — `src/server/release-email.ts` (`noteItems` → `summarizeReleaseNotes` → HTML/text Highlights): for `### heading` + paragraph notes (v0.5.93 shape), `detail` is the entire section body, not one sentence. The checked-in `docs/release-email-samples/v0.5.93.html` shows multi-sentence highlight bullets that largely duplicate Full release notes, violating the 3–5 one-sentence highlight contract.

No further findings of this class were found after grepping: `summarizeReleaseNotes`, `noteItems`, `renderReleaseEmail` HTML/text highlight branches, `recordFor`/`sendAndRecord`/`previewReleaseEmail` summary paths, `release-email.test.ts`, sample fixtures, branch diff for bare `node`/`npm`/`npx`.

## Edge cases

Engineering report source `0a72a02` precedes HEAD `7582efa` (docs-only bookkeeping). Server preflight: task-file merge conflict only; close-out takes main’s copy. No prior `review-*` for #1287. Deterministic `summarizeReleaseNotes` cannot throw; empty notes fall back cleanly. Summary frozen on first `release-emails.json` write — intended.

## Suggestions

Cap TL;DR at three sentences if a third still fits ~50 words. Add focused `summarizeReleaseNotes` unit tests (word budget, paragraph vs bullet notes). Gmail fidelity remains sample-based; live inbox spot-check is optional human follow-up.

## Automated verification

- Browser console-error check (handoff evidence): **skipped** — UI handoff browser verification did not apply to this task.
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

