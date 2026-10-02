---
id: "0628"
title: "New inputs never get an AI title: PM stream-json output isn't extracted before parsing"
type: bug
status: ready
priority: high
area: [core, server]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-02T12:21:26Z"
updated_at: "2026-10-02T17:37:33Z"
---
## Problem
Creating an input should have the PM agent write a short title/type/area, but the title stays the raw first line (truncated at 100 chars) and type stays `other`. Observed on input muqwx9a1-910cq: updated_at is 15s after created_at, so the PM call ran and enrichInput wrote nothing.

Root cause (diagnosed, not yet confirmed against a captured stream): `postInput` in `src/server/routes/inputs.ts` passes `result.output` from `runPrompt` straight to `parseEnrichment`. The cursor driver runs with `--output-format stream-json` (`cursorArgs` in `src/server/agents.ts`), so output is JSONL events. The greedy `/\{[\s\S]*\}/` match spans several lines, JSON.parse throws, parseEnrichment returns {}. Running cursor-agent directly with composer-2.5 returns the correct JSON in ~20s, so model/prompt are fine. Other CLIs (e.g. pi) may behave differently; verify.

## Desired UX
- A new input gets an AI-written title, type and area shortly after creation.
- If enrichment fails or returns nothing parseable, that is visible (log/warning), not silent.
- The create panel's 'Creating in the background' copy is truthful: the POST currently blocks for the whole PM call (15-20s). Consider returning the raw input immediately and enriching asynchronously, emitting an SSE update.

## Acceptance criteria
- Run PM output through `extractOneShotReportText(pm.cli, output)` before `parseEnrichment`; also make parseEnrichment robust (non-greedy / try each candidate).
- Test with a cursor stream-json fixture that yields the title/type/area; test that unparseable output leaves the raw title and logs.
- One-off retitle of existing inputs still titled with the raw truncated first line (e.g. 0043, and the other 'other' typed inputs), done through the API, not by hand-editing files.
- Docs/user-docs updated if they describe input enrichment.

## Notes for AI
Files: src/server/routes/inputs.ts (postInput, parseEnrichment), src/core/input.ts (enrichInput), src/server/agents.ts (extractOneShotReportText ~3943, cursorArgs ~2877). Per AGENTS.md, one-shot call already records usage via recordOneShotSession; keep that. Inputs live under inputs/ and must be edited via RepoOS APIs.

## Activity

- 2026-10-02T12:21:26Z · created · unknown
- 2026-10-02T17:37:33Z · status inbox→ready
