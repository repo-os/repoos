---
id: "0992"
title: "llms.txt: descriptions, raw skill links and a small essentials bundle"
type: feature
status: done
priority: p3
area: [landing, docs]
depends_on: ["0990"]
merged_commit: eac04d01fa532c67c5bb6754ec222826a187b0c9
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/llms-txt-descriptions-raw-skill-links-an
created_at: "2026-10-31T08:31:09Z"
updated_at: "2026-10-31T17:12:06Z"
last_close_out_gate_ms: 385123
last_close_out_gate_at: "2026-10-31T17:12:06.107Z"
review_passes: 1
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
- 2026-10-31T15:27:46Z · status ready→active, branch
- 2026-10-31T15:33:04Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0989 check (pid 28333, alive), #0991 check (pid 40035, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 4s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T15:33:34Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T16:06:10Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0989 check (pid 23899, alive), #0991 check (pid 24370, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 8s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T16:31:10Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T16:56:29Z · status active→review
- 2026-10-31T16:57:28Z · note: review pass 1: good to go
- 2026-10-31T17:12:06Z · close-out gate completed in 385s

