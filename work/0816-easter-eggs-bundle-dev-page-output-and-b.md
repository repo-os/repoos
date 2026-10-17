---
id: "0816"
title: "Easter eggs bundle: Dev page output and buttons, integration timer, badges, Human list"
type: feature
status: review
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-dev-page-output-and-b
created_at: "2026-10-17T08:02:53Z"
updated_at: "2026-10-17T08:47:25Z"
---
## Problem
Five small UI items, the one open easter-eggs bundle. Items 1 to 4 of the earlier bundle #0814 already landed on main in 3e66d37e9 and are not repeated here.

1. Some card badges are too long: 'doesn't look fully fleshed out' and 'needs a human-only verification step' take a lot of room (src/ui-app/src/lib/needs-input-ui.ts).
2. There is no quick way to see every task that needs a human. Tasks are only in their status columns.
3. On a stopped Dev target, the URL line is clickable and opens a dead page. It should be greyed out.
4. The activity animation looks much bigger in Settings than in the app. Settings says 'Shown at in-app size', but on task cards and the Dev page the same setting looks about half as big. Cause: the size is set in ch units (src/ui-app/src/components/ActivityIndicator.vue, sizeStyle; src/ui-app/src/style.css, --ai-size-ch). A ch is the width of a character in the container's own font, and the Settings preview sits in a larger font than the card text.
5. The animation size control has a slider plus an Auto toggle. The user prefers the slider alone. Remove the Auto toggle; the slider's starting value is the size used. Mark the default position on the slider with a small tick instead of an Auto option.

## Desired UX
- Item 1: shorten badge text by a word or two where the meaning stays clear: 'doesn't look fully fleshed out' becomes 'not fully fleshed out'; 'needs a human-only verification step' becomes 'Needs human step'. Review the other long badges and shorten any that lose nothing.
- Item 2: a 'Human' button beside the Archived button. It toggles a list of every task that needs a human, using the same human icon and colour as the human chip on the cards. The list works like the Archived list.
- Item 3: while the target is stopped, the URL is not a link and shows 'Click Start' in grey, matching the Start button. When running, it is a normal link.
- Item 4: the activity animation has a fixed pixel size per setting, the same on every surface (task card, Dev page, Settings preview). The size no longer depends on the surrounding font. The Settings preview size is the reference, and saved sizes keep their meaning. Do not solve this by pinning font sizes.
- Item 5: no Auto toggle. The slider is the only control, starting at the saved value (or the default when none is saved). A tick marks the default position. The 'Shown at in-app size' copy is updated to match what is shown.

## Acceptance criteria
- Test: the badges read 'not fully fleshed out' and 'Needs human step'; other shortened badges keep their meaning.
- Test: the Human button lists every task that needs a human, with the human icon and colour, and toggles like Archived.
- Test: a stopped target's URL is not a link and shows 'Click Start' in grey; a running target's URL is a link.
- Test: at one setting, the activity indicator renders at the same pixel width on a task card, the Dev page and the Settings preview.
- Test: the animation size control has no Auto toggle, starts at the saved or default value, and shows a tick at the default.
- Light and dark themes checked; keyboard operable.

## Notes for AI
Start from src/ui-app/src/lib/needs-input-ui.ts (badge text), the Archived list (grep 'Archived') for the Human button, the human chip styling on task cards, the Dev target URL line in src/ui-app/src/views/DevView.vue, and for items 4 and 5 src/ui-app/src/components/ActivityIndicator.vue, src/ui-app/src/style.css (--ai-size-ch) and the animation size control in src/ui-app/src/views/SettingsView.vue (activityAnimationSizeIsAuto, the Auto toggle). Use the shared tooltip or popover component (AGENTS.md). Source: user requests 2026-10-17.

## Activity

- 2026-10-17T08:02:53Z · created · njachowski@gmail.com
- 2026-10-17T08:05:33Z · body
- 2026-10-17T08:15:27Z · status inbox→ready
- 2026-10-17T08:15:31Z · status ready→active, branch
- 2026-10-17T08:22:35Z · body
- 2026-10-17T08:23:41Z · body
- 2026-10-17T08:23:42Z · message_queued at 2026-10-17T08:23:42.919Z
- 2026-10-17T08:24:13Z · body: section Shots
- 2026-10-17T08:26:30Z · message_queued at 2026-10-17T08:26:30.553Z
- 2026-10-17T08:26:43Z · body
- 2026-10-17T08:27:09Z · message_queued at 2026-10-17T08:27:09.331Z
- 2026-10-17T08:36:43Z · message_queued at 2026-10-17T08:36:43.889Z
- 2026-10-17T08:36:44Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-17T08:39:00Z · body
- 2026-10-17T08:46:34Z · status active→review
- 2026-10-17T08:47:25Z · note: review pass 1: needs some work
