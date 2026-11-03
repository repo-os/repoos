---
id: 1014
title: "Engineering report word cap: count only the engineer's narrative, soft limit around 1,200"
type: bug
status: ready
priority: p1
area: server
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-11-03T07:45:14Z"
updated_at: "2026-11-03T16:47:24Z"
---
## Problem
The engineering report has a hard 1,000-word cap, and `src/server/engineering-reports.ts` enforces it twice: on the engineer's draft (~line 184) and again on the final markdown, which includes the server-generated change summary (~line 274: `${narrative}\n\n${summary}`, summary = base/source tree plus one line per changed file). On a task with many changed files the generated file list alone eats the budget. #1004 (18 files) was rejected at handoff with "final report has 1103 words" even after the engineer cut its own text to 302 words, forcing it to shorten useful content and loop.

## Desired UX
- The limit applies to the engineer's own narrative only. Generated content (change summary, file list, tree hashes, headings the server adds) never counts.
- The limit is a soft target of about 1,000 words in the prompt/guidance ("as much as the report needs, around 1,000 words"). If a hard cap is kept at all, it is 1,200 words of narrative, with an error that names the narrative count.
- Remove the second check on the final markdown (or make it count narrative only).

## Acceptance criteria
- [ ] A report whose narrative is under the cap is accepted regardless of how many files the generated summary lists (test with a 100-file diff).
- [ ] Narrative over the hard cap is still rejected with a message that quotes the narrative word count and the cap.
- [ ] Engineer prompt/guidance and `user-docs/engineering-reports.md` (line ~15) describe the new rule.
- [ ] Stored `wordCount` and the Dev tab Report view stay consistent with what is counted.

## Notes for AI
See `MAX_WORDS`, `words()`, and both checks in `src/server/engineering-reports.ts`; grep the engineer prompt in `src/server/agents.ts` for the 1,000-word wording. #1004 is blocked on this at handoff.

## Activity

- 2026-11-03T07:45:14Z · created · njachowski@gmail.com
- 2026-11-03T16:47:24Z · status inbox→ready
