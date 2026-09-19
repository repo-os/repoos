---
id: "0444"
title: Chat scrolls to newest messages with jump-to-latest button
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: opencode
model_override: openrouter/tencent/hy4-preview
created_at: "2026-09-19T10:26:30Z"
updated_at: "2026-09-19T10:27:10Z"
---
## Problem

When opening a chat in RepoOS, the viewport starts at the top of the conversation (oldest messages), requiring users to manually scroll to the bottom to see the latest exchange. This is counterintuitive for a conversational interface where current context is typically at the end.

## Desired UX

- Chat windows open with the viewport scrolled to the newest messages (bottom of the conversation)
- User scroll position is retained when navigating away and back
- When the user scrolls up from the bottom, a persistent floating "Jump to latest" button appears
- Clicking the button smoothly scrolls back to the newest message
- This behavior is standardized across all chat instances in the app

## Acceptance criteria

- [ ] Chat views scroll to the bottom on initial open
- [ ] User scroll position is retained (persisted to session state or localStorage)
- [ ] A floating "Jump to latest" button appears when the user scrolls away from the bottom of the chat
- [ ] Button is properly positioned (e.g., bottom-right, above any existing controls) and teleported to body per UI conventions
- [ ] Clicking the button smoothly scrolls to the most recent message
- [ ] Button auto-hides when the user reaches the bottom
- [ ] Scroll behavior is consistent across all chat types/instances in the product

## Notes for AI

- Identify which components handle chat rendering and scrolling (likely in `src/ui-app/src/views/*Chat*` or similar)
- Scroll position should be keyed by chat ID or conversation ID to allow independent retention per chat
- The floating button should follow the existing styled dropdown/button component patterns and be wrapped in `<Teleport to="body">` to avoid stacking-context issues
- Consider using a `ResizeObserver` or scroll event listener to detect when the user is near the bottom vs. scrolled up
- Auto-scroll-to-bottom on new messages should respect the user's manual scroll position (don't auto-scroll if they're reading history)
- Smooth scrolling behavior (`behavior: 'smooth'`) is preferred for UX
- Test across different chat contexts to ensure consistency

## Scope

This task covers standardizing chat scroll behavior across all chat interfaces in the RepoOS UI. It does not cover:
- Scroll behavior in non-chat components (task lists, code views, etc.)
- Changes to message ordering or filtering
- Auto-refresh or polling of new messages (assumed to exist already)

## Original prompt

I noticed when I open Ross the chat starts at the top (the oldest message), I think by default we should start at the newest message (scrolled to the bottom) and if a user has scrolled somewhere we can retain that scroll position and if they're not at the bottom we should show a floating button to let them jump to the latest message. This chat scroll behavior should be standardised across all chats unless you have a better alternative or more standardised best practice for this kind of ai chat.

## Activity

- 2026-09-19T10:26:30Z · created · hello@repoos.org
- 2026-09-19T10:26:49Z · status draft→inbox, title, area, body
- 2026-09-19T10:27:07Z · cli_override
- 2026-09-19T10:27:10Z · model_override
