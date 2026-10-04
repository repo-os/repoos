---
updated_at: "2026-10-04T16:21:31Z"
review_passes: 1
id: "0650"
title: "Context pack: rank Likely Implementation Files by task-text keyword relevance (recall 30% to 55%+)"
type: feature
status: review
priority: medium
area: core
assigned_to: ai
created_by: ""
branch: feat/context-pack-rank-likely-implementation-
created_at: "2026-10-04T15:14:59Z"
---
## Problem

`rankFiles()` in `src/core/context-pack.ts` picks the "Likely Implementation Files" with fixed rules only: area to directory (+10), exact path named in the task body (+20), partial path (+5), import proximity (+4/+3), changed in last 7 days (+2), matching test (+3). Nothing compares the task text to file contents, so a task that names no files and has a broad area gets mostly "recently modified" noise. Follow-up to #0097, which asked for relevance ranking but not for measuring it.

Measured over 426 completed tasks (cached pack vs the `src/` files the task commits actually changed; avg 6.8 files changed per task, pack size 20):

| method | mean recall | median | tasks with zero hits | precision |
|---|---|---|---|---|
| current ranker | 29.7% | 20% | 31.5% | 8.1% |
| keyword search (TF-IDF over task text as first written) | 55.1% | 50% | 7.7% | 17.0% |
| union of both | 64.5% | 66.7% | 3.8% | n/a |

Caveats: the pack is the last cached one per task, not necessarily the first; "files changed" is a proxy for "files the agent needed", it misses files read but not edited. This shows the list gets much better, NOT yet that agents spend fewer tokens.

## Desired UX

1. Add a keyword relevance signal as the primary score: tokenize the task title + body, weight terms by IDF over the repo `src/` corpus, score each file by (1 + log tf) x idf over its content, plus a path-match bonus. Keep area, import-proximity, test-pairing and recency as smaller boosts (the union result suggests they still add recall).
2. Borrow field weighting from `src/ui-app/src/search.ts` (`buildIdf` / `fieldScore`): a term hit in the file path or in an exported name should outweigh a hit in a comment or string.
3. Self-contained scorer in `src/core`, no embeddings, no new runtime dependency (hard constraint). Do not import from `src/ui-app`.
4. Cache the per-file token index keyed on HEAD like the existing repo map (`buildRepoMap`), so generation time does not regress; check against the existing `generationMs` telemetry.
5. Keep the pack format and its stable-first ordering intact so cached packs and #0639-era cache work still apply.

## Acceptance criteria

- A committed, re-runnable evaluation script (or test) that reproduces the recall table above from git history and cached packs, and the new ranker beats the current one on mean recall and zero-hit rate. Report before/after in the task notes.
- Tuning changes (weights, boosts) are each justified by a before/after recall number from that script.
- Context pack generation time on this repo does not regress materially (report `generationMs` before/after).
- Unit tests for the scorer (rare term outranks common term, path hit outranks body hit, stable ordering on ties).
- Docs touched by the diff updated (`docs/prompt-caching-audit.md` describes the pack; note the new ranking there).
- `repoos check --changed main` passes.

## Notes for AI

- Do NOT use embeddings / RAG / a vector index; the measured gain is available from plain lexical scoring.
- The UI search (`src/ui-app/src/search.ts`) is the same TF-IDF family but over tasks/docs/settings only, tuned for short queries, and uses edit distance for typo tolerance, which is wrong for identifiers. Borrow the idea, not the code.
- Follow-up worth a separate task, not this one: log which files the pack suggested vs which files the agent actually opened (tool_use paths) per session, to measure real token savings.

## Activity

- 2026-10-04T15:14:59Z · created · unknown
- 2026-10-04T15:16:13Z · status inbox→ready
- 2026-10-04T15:17:56Z · status ready→active, branch
- 2026-10-04T16:07:24Z · note: Recall eval (#0650), full 427-task corpus (cached pack vs the src/ files each task committed): baseline 30.0% mean recall / 20% median / 30.9% zero-hit / 8.1% precision; new ranker 73.6% / 75% / 1.9% / 22.1%; union 76.2%. Reproduce: bun scripts/context-pack-eval.ts (defaults to the repo root; --root/--limit available).
- 2026-10-04T16:07:25Z · note: Tuning (#0650): title/body field sweep on a 250-task sample, combined ranker: bodyWeight 1.0=47.6%, 0.5=59.0%, 0.2=63.9%, 0.05=73.6% (full corpus), 0.0=78.7%; field-weight scale 1x/3x/6x moved recall under 1 point so it is the path>export>body ratio that matters, not magnitude. generationMs: warmed pack generation ~31ms vs 84ms mean over the cached population (repo-map token index cached on HEAD; import-proximity expansion bounded to the top 30 seeds).
- 2026-10-04T16:07:27Z · note: Unrelated unblock (#0650): repoos check's css-layers guard was red on main (a.side-git-commit-btn at src/ui-app/src/style.css:1039, from the sidebar git popover, guard commit e8de77266 predates it). Folded text-decoration:none into .side-git-commit-btn and removed the bare-element selector so the gate can pass; no visual change.
- 2026-10-04T16:20:49Z · status active→review

