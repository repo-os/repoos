---
id: "1187"
title: "Agents must never open a visible browser or steal focus: add rule + guard for QA/preview runs"
type: chore
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: t@t
branch: ""
created_at: "2026-11-18T14:08:00Z"
updated_at: "2026-11-18T14:08:00Z"
---
## Problem
Nick reports QA engineers' preview servers (e.g. http://127.0.0.1:7273/agents from #1184's 'just serve-noauth') pop open in his real Chrome and take focus from his laptop. Nothing in serve/justfile opens a browser, so the engineer (codex luna) did it via open/xdg-open, a headed browser, or system Chrome.
## Desired UX
Agents verify UI headlessly only; nothing ever steals focus on the human's machine.
## Acceptance criteria
- Add a one-line rule to AGENTS.md (keep under 30 KB) and the long form in docs/agent-ui-and-preview-conventions.md: never run open/xdg-open on URLs, never launch a headed browser or the user's Chrome profile; use headless Playwright with its bundled browser.
- Add the same rule to the engineer agent instructions text where they are defined (default template), with a test.
- Find where a browser was actually launched (check recent engineer transcripts for open/channel: chrome/headless false) and fix any repo script that does it.
## Notes for AI
Do not touch repoos.toml (the live engineer instructions there are Nick's to edit; propose the text in the task notes instead).

## Activity

- 2026-11-18T14:08:00Z · created · t@t
