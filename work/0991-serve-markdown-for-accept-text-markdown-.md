---
id: "0991"
title: "Serve Markdown for Accept: text/markdown at both site roots"
type: feature
status: active
priority: p2
area: [landing, docs]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/serve-markdown-for-accept-text-markdown-
created_at: "2026-10-31T08:31:06Z"
updated_at: "2026-10-31T18:11:03Z"
close_out_repair_count: 1
review_passes: 1
---
## Problem

`Accept: text/markdown` already works for docs pages (#0987), but `/` on docs.repoos.org and on repoos.org still returns HTML because there is no .md copy; `/index.md` returns 404.

## Desired UX

An agent asking for Markdown at either root gets it; browsers still get HTML.

## Acceptance criteria

- [ ] `curl -sI -H 'Accept: text/markdown' https://repoos.org/` and the docs root return `content-type: text/markdown` with `Vary: Accept`.
- [ ] A plain curl at both roots still returns `text/html`, and the existing `/llms.txt`, `.md` twins and `rel="alternate"` links are unchanged.
- [ ] The Markdown served is the existing llms.txt content or a new index.md, whichever is simpler; no duplicate content to maintain by hand.
- [ ] Tests cover both roots with and without the Accept header.

## Notes for AI

Build on #0987 (docs negotiation) and the landing worker in `landing/worker.ts`. Verification against the live sites needs a deploy; say so in the summary.

## Activity

- 2026-10-31T08:31:06Z · created · njachowski@gmail.com
- 2026-10-31T12:21:57Z · status inbox→ready
- 2026-10-31T12:56:21Z · status ready→active, branch
- 2026-10-31T13:07:20Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0989 check (pid 56011, alive), #0990 check (pid 89885, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 12s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T13:07:37Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T13:11:44Z · note: adopted orphaned engineer pid 60316
- 2026-10-31T13:47:03Z · status active→review
- 2026-10-31T13:48:00Z · note: review pass 1: good to go
- 2026-10-31T15:33:49Z · watchdog: check wait escalated · waiting: waiting for a local check slot (2 ahead, position 3); waiting behind #0989 check (pid 28333, alive), #0992 check (pid 40140, alive); slot holder has made no progress for 30 minutes (no heartbeat) for 12s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T15:34:41Z · note: shots: skipped — 2 handoff shots already captured for this exact plan (bf59e7020) during finalization (#0734)
- 2026-10-31T15:57:55Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T15:57:55Z · status review→active
- 2026-10-31T15:57:55Z · note: close-out repair: gate-failure
- 2026-10-31T16:04:40Z · watchdog: check wait escalated · waiting: waiting for a Playwright slot — position 2 (1 ahead); slot holder has made no progress for 30 minutes (no heartbeat) for 7s · next step: investigate the abnormal wait; the flag clears when the check starts
- 2026-10-31T16:05:25Z · watchdog: check wait ended or recovered — cleared needs_input
- 2026-10-31T17:03:41Z · note: adopted orphaned engineer pid 17788
- 2026-10-31T17:05:06Z · note: adopted orphaned engineer pid 17788
