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
updated_at: "2026-11-20T04:53:08Z"
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
- 2026-11-20T04:53:08Z · status active→review
