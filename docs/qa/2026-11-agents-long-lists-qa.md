# Agents long-lists QA — 2026-11 (#1241)

## Scope and setup

QA covered **Build Your Team**, **Scheduled Tasks** and **Reminders** with
long lists (50+ entries) and long names, at 375, 768 and 1280 px. Every check
ran against fixtures in `src/ui-app/tests/agents-page-qa-browser.test.ts`:

- The real `ScheduledTasksPanel`, `RemindersPanel` and `AgentsView` are mounted
  in jsdom against Pinia stores. Their API responses are stubbed with fixtures.
- Their rendered markup is loaded into headless Playwright WebKit with the built
  global stylesheet. Scoped styles are compiled from the component files where
  the component has them.
- No browser window is opened and no focus is taken. No live server, backend or
  real data is involved.

Run it with `bunx vitest run --config src/ui-app/vite.config.ts agents-page-qa-browser`.
Set `QA_SHOTS=<dir>` to save full-page screenshots to a scratch directory.

## Fixtures

| Section | Entries | Long-name cases |
| --- | --- | --- |
| Scheduled Tasks | 60 schedules | 96-character unbroken names (every 5th), 100+ character sentence names, template-incomplete warnings |
| Reminders | 60 reminders | Unbroken and sentence reminder text, long agent/model link labels, upcoming / due / overdue / done states |
| Build Your Team | 55 custom agents | Unbroken and hyphenated names, enabled and disabled cards |

## Results

| Check | 375 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Scheduled Tasks list, 60 cards fit the viewport and each name stays in its card | Fixed (see below), passes | Fixed, passes | Passes |
| Reminders list, 60 rows fit and text stays in its row | Passes | Passes | Passes |
| Build Your Team, 55 custom agents fit the viewport | Passes | Passes | Passes |
| Schedule editor: invalid timezone shows the plain-English message and fits | Passes | Passes | Passes |
| Reminder editor: cleared date shows "Choose a valid date and time" and fits | Passes | Passes | Passes |

### Findings fixed

- **Schedule names ran past their card at 375 and 768 px.** A 96-character
  unbroken name extended beyond the card border. The viewport audit did not
  catch it, because the text stayed on screen. The title container now has
  `min-width: 0`, and the title wraps with `overflow-wrap: anywhere`
  (`src/ui-app/src/components/ScheduledTasksPanel.vue`). A new assertion,
  `expectInsideCards`, checks that inner text stays inside its card's border.
  With the fix removed, it fails at 375 and 768 px with 12 overflowing names per
  width. The fix is present and the test passes.

### Form validation

Validation messages already read in plain English. The QA added tests that
trigger the real validation and check the message text, with the open editor
fitting each width:

- Schedule timezone `Mars/Olympus-Base` → "Timezone must be a valid IANA name
  (e.g. Asia/Singapore)".
- Reminder with the date cleared → "Choose a valid date and time".

## Visual check

Screenshots of the 375 px schedule and reminder lists were reviewed. The
schedule finding above came from that review. After the fix, the schedule
title wraps inside its card. The reminder rows read cleanly, with the due
state, time, text and actions visible.

## Not covered

- **Persistence.** Saving schedules and reminders against the real backend
  was not exercised. The earlier pass (`agents-tabs.md`) covered API-stubbed
  create/edit flows, and this pass did not repeat them.
- **Built-in team cards.** `BuiltInAgentCard` is stubbed in the Build Your Team
  case. Its long-content layout is not covered here.
- **Live data.** Results come from fixtures only. Real schedules and reminders
  may hold content the fixtures do not.
- **Human review.** No human has looked at these screens on a real device.
