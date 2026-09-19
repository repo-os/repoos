---
id: "0444"
title: Chat scrolls to newest messages with jump-to-latest button
type: feature
status: ready
priority: p2
area: web
assigned_to: ai
created_by: hello@repoos.org
branch: ""
cli_override: opencode
model_override: openrouter/tencent/hy4-preview
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-19T10:26:30Z"
updated_at: "2026-09-19T10:39:04Z"
---
## Problem

When opening a chat in RepoOS, the viewport starts at the top of the conversation (oldest messages), requiring users to manually scroll to the bottom to see the latest exchange. This is counterintuitive for a conversational interface where current context is typically at the end.

Additionally, the chat UI has several polish and consistency issues:
- Helper text line under chat boxes is unnecessary clutter
- CTO chat has incorrect bottom padding/margin
- Send message button color is indistinguishable (dark blue on dark background)
- Messages lack vertical spacing, making conversations hard to read
- Status indicator shows "-agent stopped-" text instead of showing active thinking state
- AI chat design patterns are inconsistent across different chat instances in the app

## Desired UX

- Chat windows open with the viewport scrolled to the newest messages (bottom of the conversation)
- User scroll position is retained when navigating away and back
- When the user scrolls up from the bottom, a persistent floating "Jump to latest" button appears
- Clicking the button smoothly scrolls back to the newest message
- Helper text below chat input boxes is removed
- CTO chat bottom spacing is corrected
- Send message button has clear, distinct coloration
- Messages have consistent vertical spacing for readability
- AI thinking/working state shows a pulsing visual indicator (not text)
- No indicator is shown when the AI is idle/stopped
- All AI chat instances across the app follow the same design patterns and conventions
- This behavior is standardized across all chat instances in the app

## Acceptance criteria

- [ ] Chat views scroll to the bottom on initial open
- [ ] User scroll position is retained (persisted to session state or localStorage)
- [ ] A floating "Jump to latest" button appears when the user scrolls away from the bottom of the chat
- [ ] Button is properly positioned (e.g., bottom-right, above any existing controls) and teleported to body per UI conventions
- [ ] Clicking the button smoothly scrolls to the most recent message
- [ ] Button auto-hides when the user reaches the bottom
- [ ] Scroll behavior is consistent across all chat types/instances in the product
- [ ] Helper text under chat input boxes is removed
- [ ] CTO chat bottom padding/margin is fixed
- [ ] Send message button has distinct, accessible coloration
- [ ] Messages have consistent vertical spacing between them
- [ ] AI thinking/working state displays a pulsing visual indicator
- [ ] No text indicator (like "-agent stopped-") is shown; state is conveyed visually
- [ ] Idle/stopped state shows no indicator
- [ ] All AI chat components follow a standardized design pattern
- [ ] Shared AI chat component(s) or design system rules documented
- [ ] Tests exist to prevent future AI chat implementations from deviating from the standard

## Notes for AI

- Identify which components handle chat rendering and scrolling (likely in `src/ui-app/src/views/*Chat*` or similar)
- Scroll position should be keyed by chat ID or conversation ID to allow independent retention per chat
- The floating button should follow the existing styled dropdown/button component patterns and be wrapped in `<Teleport to="body">` to avoid stacking-context issues
- Consider using a `ResizeObserver` or scroll event listener to detect when the user is near the bottom vs. scrolled up
- Auto-scroll-to-bottom on new messages should respect the user's manual scroll position (don't auto-scroll if they're reading history)
- Smooth scrolling behavior (`behavior: 'smooth'`) is preferred for UX
- Check `src/ui-app/src/views/*Chat*` components for helper text that needs removal
- Review CTO chat view styling for bottom margin/padding issues
- Update send button styling to use a more contrasting color (check existing button color palette in style.css)
- For message spacing: add consistent margin-bottom or gap (if using flexbox) between message elements
- For AI thinking indicator: replace "-agent stopped-" text with a pulsing animation (consider CSS keyframes or a small pulsing dot/spinner); use opacity or scale animations
- Search the codebase for all AI chat implementations (Ross, CTO, any others) to ensure consistency
- Create a shared AI chat design spec or component documentation (in `docs/` or as a comment in the code)
- Write tests (likely in component or integration tests) to validate:
  - Message spacing exists and is consistent
  - Thinking indicator pulsing behavior when agent is active
  - No indicator shown when agent is idle
  - All chat instances apply these rules
  - This prevents future AI chats from missing these patterns
- Test across different chat contexts to ensure consistency

## Scope

This task covers standardizing chat scroll behavior, visual design, and status indicators across all chat interfaces in the RepoOS UI, including UI polish fixes and establishing design patterns for all future AI chat implementations. It does not cover:
- Scroll behavior in non-chat components (task lists, code views, etc.)
- Changes to message ordering or filtering
- Auto-refresh or polling of new messages (assumed to exist already)
- Modifying the underlying AI backend or API responses

## Original prompt

I noticed when I open Ross the chat starts at the top (the oldest message), I think by default we should start at the newest message (scrolled to the bottom) and if a user has scrolled somewhere we can retain that scroll position and if they're not at the bottom we should show a floating button to let them jump to the latest message. This chat scroll behavior should be standardised across all chats unless you have a better alternative or more standardised best practice for this kind of ai chat.

Also while fixing the chats, please remove the line of text (helper) under the chat boxes, and on the cto one fix the bottom padding/margin, also fix the coloration of the send message button here, it's basically just an indistinguishable blue thing...

Also could you make sure there's some spacing between the messages (vertical spacing) and rather than saying `-agent stopped-` let's do the inverse: show a pulsing something/action if the ai is actively thinking/working/writing and nothin if it's stopped -- also add this to this task please (and apply in all ai chats not just this one...) since we have ai chats a lot of places make sure they all obey these design rules and create tests if necessary to ensure any future ai chats behave correctly and don't reinvent the wheel.

## Activity

- 2026-09-19T10:26:30Z · created · hello@repoos.org
- 2026-09-19T10:26:49Z · status draft→inbox, title, area, body
- 2026-09-19T10:27:07Z · cli_override
- 2026-09-19T10:27:10Z · model_override
- 2026-09-19T10:27:18Z · review_model_override
- 2026-09-19T10:32:05Z · body
- 2026-09-19T10:36:28Z · body
- 2026-09-19T10:39:04Z · status inbox→ready
