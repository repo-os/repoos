# Story flows QA — November 2026 (create, link, progress)

## Scope

QA pass for creating a story, linking tasks to it, and reading its progress, at 375, 768 and 1280 px. Covered: the New story dialog (empty, duplicate name, server failure, unreachable server), the Stories list with a zero-task story, a 40-task story and a long-name story, and the story side panel. Unlink is covered only where noted below.

## Method

All browser checks were fixture-based and headless. `src/ui-app/tests/stories-create-progress-qa-browser.test.ts` renders the real `NewStoryPanel`, `StoriesView` and `StoryPanel` in jsdom against seeded stores and stubbed `fetch` responses. The rendered markup is then loaded into headless Playwright WebKit with the built global stylesheet. Each width must pass the no-overflow, no-clipped-control and document-width audit. No visible browser, no user Chrome profile, and no live server or preview were used. Run it with `bun run build` first, then `bun run test:vitest -- src/ui-app/tests/stories-create-progress-qa-browser.test.ts`.

## Results

| Flow | State | 375 / 768 / 1280 px | Result |
| --- | --- | --- | --- |
| Create: empty description | Create story is disabled | Fits, no clipped control | Fixed. The disabled button gave no reason. It now shows "Add a description to create the story." |
| Create: duplicate name | Server returns 409 with the reason | Error fits; typed name and description are kept; nothing saved | Pass. The message now ends with a next step: "…already exists. Choose a different name." |
| Create: server failure | Server returns 500 with a reason | Error fits, including a long unbroken token | Pass. The server's reason is shown. |
| Create: server unreachable | `fetch` rejects | Error fits | Pass. Shows the standard "Can't reach the RepoOS server" message. |
| Progress: zero tasks | Registered story with no tagged tasks | Card fits | Pass. Progress reads 0%, not NaN%. |
| Progress: many tasks | 40 tasks, 10 done | Card fits | Pass. Progress reads 25%. |
| Progress: long name | Two-line-plus name and unbroken excerpt token | Card fits | Pass. Wraps without overflow. |
| Story panel | 40 tasks, 10 done | Panel fits | Pass. Summary reads "40 tasks · 10 done". |
| Create: success | Server returns a definition | Not asserted in the browser suite | Not covered in this pass. The success path is covered by the existing story component tests. |
| Link and unlink | Task drawer Story select | Not audited at widths | Partial. `task-drawer-story-select.test.ts` covers the new-task unlink ("No story" clears the tag) and navigation. The edit-drawer save path for link and unlink has no independent assertion. |

## Findings and fixes

1. **Disabled Create story with no reason.** The button was disabled until a description was entered, and nothing said so. A reader could not tell why it was off. `NewStoryPanel.vue` now shows a one-line hint above the button row while the description is empty. The style is `.ff-hint` in `style.css`.
2. **Duplicate-name message had no next step.** `writeStoryDefinition` and `rewriteStoryDefinition` now end with "Choose a different name." The check is still case-insensitive. `story-definitions.test.ts` asserts the full sentence. The 409 mapping in the route is unchanged, because it matches on "already exists".

No layout overflow, clipped control, dead link or NaN progress was found at any of the three widths.

## Known gaps

- Registering a story whose name matches a tag-only story (one that exists only as a task tag) succeeds silently. The two merge into one group by name key, so the user is not warned. This is deliberate for adopting an existing tag, but it is not stated in the UI. Left as is; a follow-up task could decide whether to say so.
- The edit-drawer story select has no independent test for saving a link or unlink, and it is not in the browser audit. Link and unlink at 375 and 768 px remain unverified in a browser.
- No live-server pass was run. Everything above is fixture-based.

## Verification notes

- `bun run test:vitest -- src/ui-app/tests/stories-create-progress-qa-browser.test.ts src/ui-app/tests/story-definitions.test.ts src/ui-app/tests/stories-view.test.ts src/ui-app/tests/story-panel.test.ts src/ui-app/tests/stories-inbox-search-qa-browser.test.ts`: 5 files, 110 tests passed after the fixes.
- Before the fixes, the new browser suite had 3 failing tests (the empty-form hint at each width). The other 12 passed after two harness fixes: a native click dispatch and syncing typed field values into the captured markup.
- The scoped `REPOOS_CHECK_CHANGED=main repoos check` result is recorded in the engineering report for this task.
