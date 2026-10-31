---
id: "0992"
title: "llms.txt: descriptions, raw skill links and a small essentials bundle"
type: feature
status: ready
priority: p3
area: [landing, docs]
depends_on: ["0990"]
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-31T08:31:09Z"
updated_at: "2026-10-31T12:21:41Z"
---
## Problem

1. The Agent Skill links in both llms.txt files point at the GitHub HTML tree view, not the raw SKILL.md.
2. repoos.org/llms.txt links to HTML docs pages instead of the .md copies docs.repoos.org/llms.txt already uses.
3. Most docs.repoos.org/llms.txt entries have no one-line description.
4. llms-full.txt is about 455 KB (~110k tokens), too big for many agents.

## Desired UX

Every index entry says what it is, skill links return raw Markdown, and a small bundle gives an agent the essentials in one fetch.

## Acceptance criteria

- [ ] Both llms.txt files link the skill at its raw SKILL.md URL, and a curl returns Markdown.
- [ ] repoos.org/llms.txt points docs links at the .md copies.
- [ ] Every docs.repoos.org/llms.txt entry has a one-line description.
- [ ] At least one bundle under about 30k tokens exists (per-section bundles or an essentials file) and is listed in llms.txt.
- [ ] The llms index check and agent guide check pass, and `llms-full.txt` still exists.

## Notes for AI
Do this after #0990 (starter prompt and init docs) lands, to avoid conflicts in the same files. Generate bundles from the docs at build time instead of hand-maintaining them.

## Activity

- 2026-10-31T08:31:09Z · created · njachowski@gmail.com
- 2026-10-31T08:31:16Z · body: Notes for AI (added 1, removed 1)
- 2026-10-31T08:31:17Z · depends_on
- 2026-10-31T12:21:41Z · status inbox→ready
