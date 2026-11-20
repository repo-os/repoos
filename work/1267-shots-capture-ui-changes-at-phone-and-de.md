---
id: "1267"
title: "Shots: capture UI changes at phone and desktop widths, and let a shot declare its viewport"
type: feature
status: review
priority: p2
area: [web, core]
assigned_to: ai
created_by: t@t
branch: feat/shots-capture-ui-changes-at-phone-and-de
cli_override: claude code
model_override: haiku
created_at: "2026-11-20T03:17:57Z"
updated_at: "2026-11-20T05:59:43Z"
review_passes: 1
---
## Problem
Declared and automatic UI shots are only captured at 1280x800. Mobile-focused tasks (the recent QA passes) show only desktop shots, so reviewers cannot see the mobile result. The CLI already accepts --viewport WIDTHxHEIGHT, but the Shots entries engineers declare have no width field.

## Desired UX
- A declared shot can set an optional viewport: phone (390x844), tablet (820x1180) or desktop (1280x800).
- Automatic shots for touched UI targets are captured at phone and desktop by default; tablet only when declared.
- Each shot is captioned with its width so the review shows which size it is.

## Acceptance criteria
- repoos update --shots validates and stores the new viewport field; unknown values are rejected with a clear error.
- Handoff capture honours the viewport per shot; auto shots produce a phone and a desktop capture.
- Captions and the review UI show the size; shot count stays bounded and capture time impact is noted in docs.
- Docs updated (docs/agent-ui-and-preview-conventions.md, user-docs if shots are documented); tests added.

## Notes for AI
Start from src/commands/shot.ts (VIEWPORT, --viewport) and the handoff shot capture code. Never touch repoos.toml. Headless Playwright only.

## Activity

- 2026-11-20T03:17:57Z · created · t@t
- 2026-11-20T03:18:22Z · status inbox→ready
- 2026-11-20T03:18:33Z · cli_override, model_override
- 2026-11-20T03:18:44Z · status ready→active, branch
- 2026-11-20T03:36:31Z · body
- 2026-11-20T03:42:14Z · CTO nudge: held — handoff gate is running
- 2026-11-20T03:57:25Z · handoff failed · remote validation failed: test failure: tests/checks-live-run-responsive.test.ts > Checks live run view at phone, tablet and desktop widths (WebKit) > keeps every live run state inside its boxes at 375 px, tests/checks-releases-data-responsive.test.ts > Checks and Releases long data (WebKit) > renders real page components with long data at 375 px on thinkpad — fix it in the feature branch and re-run the gate
- 2026-11-20T03:57:25Z · message_queued at 2026-11-20T03:57:25.618Z
- 2026-11-20T04:00:35Z · watchdog: restarting engineer because a queued message waited 3m with no live process
- 2026-11-20T04:00:44Z · message_delivered: 1 message(s)
- 2026-11-20T04:47:20Z · body
- 2026-11-20T04:52:30Z · CTO nudge: held — handoff gate is running
- 2026-11-20T04:53:09Z · status active→review
- 2026-11-20T04:53:10Z · message_queued at 2026-11-20T04:53:10.028Z
- 2026-11-20T04:53:11Z · note: shots: skipped — Docs site skipped: no docs shot declared
- 2026-11-20T04:57:09Z · note: review pass 1: good to go
- 2026-11-20T05:59:43Z · message_overdue: still queued after 60m without being delivered
