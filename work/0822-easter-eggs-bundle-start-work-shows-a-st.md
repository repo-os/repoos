---
id: "0822"
title: "Easter eggs bundle: Start work pending state, and Bird quick trail animation"
type: bug
status: review
needs_input: true
needs_input_reason: review-rounds-exhausted
needs_input_detail: "`needs some work` — E1 is implemented well (`startWorkPendingIds`, card + drawer guards, watchdog, `start-work-pending.test.ts` covers disable, single POST, failure clear, and drawer). E2 adds `bird-quick-trail` end-to-end (schema, `ActivityIndicator`, CSS keyframes, motion tests). Handoff UI evidence is incomplete: the Settings capture (`default-1.png`) landed on **Themes**, `waitFor`/`highlight` for `.ai-style-bird-quick-trail` timed out, and **drawer** light/dark PNGs (`default-4`/`default-5`) are referenced in verification JSON but **not on disk** (only three PNGs in `work/.attachments/0822/shots`). Board light/dark shots (`default-2`/`default-3`) clearly show disabled **Starting…** on #9999; bird footprints appear on reviewing cards, but that is not a Settings preview sign-off."
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/easter-eggs-bundle-start-work-pending-st
cli_override: cursor
model_override: composer-2.5
created_at: "2026-10-18T02:36:59Z"
updated_at: "2026-10-18T05:37:13Z"
review_passes: 4
close_out_repair_count: 1
review_rounds: 2
---
## Items

- [ ] **E1 · Start work pending state** (web) — Start work shows a "Starting…" state and cannot be clicked twice. Source: user report 2026-10-18.
- [ ] **E2 · Bird quick trail animation** (web, settings) — new `bird-quick-trail` Activity animation option. Source: human request 2026-10-17.

Each item below has the same parts: Problem, Desired UX, Acceptance criteria, Notes for AI. Edit one item at a time with `--section`; never resend the whole body.

## E1 · Start work pending state

### Problem
Clicking 'Start work' on a ready task does nothing visible until the server's status update reaches the browser and the card moves to Active. The button stays enabled in the meantime, so a second click is sent to the server and returns a red 'already working' warning. The UI has no pending state for the start (src/ui-app/src/stores/repo.ts, startWork, which just awaits the API call; the button is TaskCard.vue 'Start work').

### Desired UX
- On click, the card immediately shows a 'Starting…' or 'Moving to work' state with a small animation, and 'Start work' is disabled.
- The pending state clears when the task reaches Active, or when the request fails (then show the error and re-enable the button).
- The same applies to the drawer's start action.

### Acceptance criteria
- Test: clicking Start work once disables the button and shows the starting state until the task status changes to active.
- Test: a second click during the starting state does not send a second request.
- Test: a failed start clears the starting state and shows the error.
- Light and dark themes checked on the starting state; the animation respects reduced motion.

### Notes for AI
Start from startWork in src/ui-app/src/stores/repo.ts and the Start work button in src/ui-app/src/components/TaskCard.vue (and the drawer's start action). Keep a per-task pending set in the store. Source: user report 2026-10-18.

## E2 · Bird quick trail animation

### Problem
The Activity animation choices have no bird-footprint option. The human selected only **Bird · quick trail**; do not add mouse, rabbit or other animal concepts. Related animation work: #0787, #0798, #0807 and size configuration #0813.

### Desired UX
Add **Bird quick trail** (`bird-quick-trail`) to the existing Activity animation choices in Settings and repoos.toml. Match the approved preview: two alternating three-toed bird footprints on a diagonal, with long tapered central toes, shorter splayed side toes, and short rounded heels. Prints angle outward; a whole footprint lifts, plants, and fades before the other print, producing a fast walking trail. The attached bird-track drawing is the shape reference; do not copy the watermark or use the reference bitmap as the UI asset.

Approved preview: /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/mouse-bird-motion.html, first variant (Bird · quick trail). It is also unchanged in /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/bird-rabbit-motion.html. Local preview files may not exist on remote runners; the geometry and keyframes below are the durable source.

At Auto size the footprint is 2ch × 1.15em in the label's font. Each foot uses the markup `.foot > i.toe.l + i.toe + i.toe.r + i.heel`; the second foot also has `.second`. The enclosing artwork has `.quick` and fills a position:relative slot. Coding --beat is 1.25s; reviewing is 1.75s; generic agent work is 1.5s. The quick trail uses 0.7 × --beat with half-period staggering (coding period 0.875s, agent period 1.05s); reviewing switches to the more planted/pivoting careful keyframe at its reviewing period. Map the parent activity classes correctly to the actual shared-component DOM.

```css
.foot{position:absolute;display:block;width:.53em;height:.64em;left:.03em;top:0;transform:rotate(-18deg);animation:br-step var(--beat) ease-in-out infinite;transform-origin:50% 75%}
.foot.second{left:auto;right:.02em;top:auto;bottom:0;--tilt:18deg;animation-delay:calc(var(--beat)*-.5)}
.toe{width:.105em;height:.48em;left:calc(50% - .0525em);top:0;background:currentColor;transform-origin:50% 100%;clip-path:polygon(49% 0,67% 12%,100% 47%,88% 88%,65% 100%,30% 100%,8% 87%,0 47%,32% 12%)}
.toe.l{height:.4em;top:.08em;transform:rotate(-48deg)}
.toe.r{height:.4em;top:.08em;transform:rotate(48deg)}
.heel{width:.12em;height:.24em;left:calc(50% - .06em);top:.39em;background:currentColor;border-radius:40% 40% 55% 55%;transform:rotate(5deg)}
.foot::after{content:'';position:absolute;width:.16em;height:.15em;left:calc(50% - .08em);top:.37em;border-radius:50%;background:currentColor}
.quick .foot{animation-name:br-quick;animation-duration:calc(var(--beat)*.7)}
.quick .foot.second{animation-delay:calc(var(--beat)*-.35)}
.careful .foot{animation-name:br-careful;animation-duration:calc(var(--beat)*1.3)}
.careful .foot.second{animation-delay:calc(var(--beat)*-.65)}
.review .foot{animation-name:br-careful}
@keyframes br-step{0%,100%{opacity:.18;transform:translateY(.07em) scale(.7) rotate(var(--tilt,-18deg))}30%,60%{opacity:1;transform:translateY(0) scale(1) rotate(var(--tilt,-18deg))}}
@keyframes br-quick{0%,100%{opacity:.12;transform:translateY(.12em) scale(.7) rotate(var(--tilt,-18deg))}25%,45%{opacity:1;transform:translateY(-.01em) scale(1) rotate(var(--tilt,-18deg))}70%{opacity:.3;transform:translateY(-.08em) scale(.9) rotate(var(--tilt,-18deg))}}
@keyframes br-careful{0%,100%{opacity:.2;transform:scale(.8) rotate(var(--tilt,-18deg))}30%,75%{opacity:1;transform:scale(1) rotate(calc(var(--tilt,-18deg) + 8deg))}}
```

Use the shared ActivityIndicator and current activity/theme colors via currentColor. Keep the default animation and every existing style unchanged. Integrate with the current size preference if #0813 has landed; explicit sizes must scale the complete bird artwork and movement together using the existing shared approach. Preserve reduced-motion behavior (two static readable footprints, second dimmer), accessible status labels, Settings preview, config validation/persistence and user-facing option documentation. No new runtime dependencies.

### Acceptance criteria
- Config round-trip accepts `bird-quick-trail`; the option appears in the styled Settings selector and persists after reload without changing the existing default.

### Notes for AI
Independent of E1; do not couple the two. Keep the default animation and every existing style unchanged.

## Shots
```json
[
{
"label": "Bird quick trail activity animation preview",
"target": "default",
"route": "/settings?tab=general",
"highlight": ".activity-animation-preview .ai-style-bird-quick-trail",
"steps": [
{
"waitFor": ".activity-animation-preview .ai-style-bird-quick-trail"
}
],
"state": "settings:birdQuickTrail"
},
{
"label": "Ready card Starting… (light)",
"target": "default",
"route": "/work",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-action-footer\"]",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]"
}
],
"state": "board:startWorkPending",
"theme": "light"
},
{
"label": "Ready card Starting… (dark)",
"target": "default",
"route": "/work",
"highlight": "[data-task-id=\"9999\"] [data-test-id=\"task-card-action-footer\"]",
"steps": [
{
"waitFor": "[data-task-id=\"9999\"] [data-test-id=\"task-card-agent-hint\"]"
}
],
"state": "board:startWorkPending",
"theme": "dark"
},
{
"label": "Drawer Start work Starting… (light)",
"target": "default",
"route": "/work?task=9999",
"highlight": "[data-test-id=\"task-drawer-start-work\"]",
"steps": [
{
"waitFor": "[data-test-id=\"task-drawer-start-work\"]"
}
],
"state": "drawer:startWorkPending",
"theme": "light"
},
{
"label": "Drawer Start work Starting… (dark)",
"target": "default",
"route": "/work?task=9999",
"highlight": "[data-test-id=\"task-drawer-start-work\"]",
"steps": [
{
"waitFor": "[data-test-id=\"task-drawer-start-work\"]"
}
],
"state": "drawer:startWorkPending",
"theme": "dark"
}
]
```

## Problem
Bundle of two small, independent web items (E1 Start work pending state; E2 Bird quick trail animation). Per-item detail is under Items and the E1/E2 sections below.

## Desired UX
E1: Start work shows a Starting… state and cannot be clicked twice. E2: Bird quick trail is a selectable Activity animation. Full UX per item is in the E1 and E2 sections.

## Activity

- 2026-10-18T02:36:59Z · created · njachowski@gmail.com
- 2026-10-18T02:38:49Z · body: Bird quick trail animation (second item) (added)
- 2026-10-18T02:38:56Z · title
- 2026-10-18T02:41:29Z · status inbox→ready
- 2026-10-18T02:48:06Z · body: Items (added); E1 · Start work pending state (added); E2 · Bird quick trail animation (added); Problem (removed); Desired UX (removed); Acceptance criteria (removed); Notes for AI (removed); Bird quick trail animation (second item) (removed)
- 2026-10-18T02:48:14Z · cli_override, model_override
- 2026-10-18T02:48:17Z · status ready→active, branch
- 2026-10-18T02:51:45Z · body
- 2026-10-18T02:52:51Z · body
- 2026-10-18T02:54:16Z · body
- 2026-10-18T03:02:16Z · status active→review
- 2026-10-18T03:02:17Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-10-18T03:03:27Z · note: review pass 1: needs some work
- 2026-10-18T03:03:29Z · status review→active
- 2026-10-18T03:04:45Z · body
- 2026-10-18T03:06:25Z · body
- 2026-10-18T03:08:23Z · body
- 2026-10-18T03:09:43Z · handoff failed · remote validation failed: test failure: gate exit 1 on mini — fix it in the feature branch and re-run the gate
- 2026-10-18T03:15:31Z · watchdog: auto-surfaced stuck task · status active→review · agent crashed or was interrupted mid-turn — remote validation failed: test failure: gate exit 1 on mini — fix it in the feature branch and re-run the gate · next step: the agent turn was interrupted — open the task and resume the session in its worktree to finish and hand off
- 2026-10-18T03:15:32Z · note: handoff requested (cli)
- 2026-10-18T03:23:49Z · status active→review
- 2026-10-18T03:23:49Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-10-18T03:23:49Z · note: shots: skipped — 5 handoff shots already captured for this exact plan (2f5c5bc1d) during finalization (#0734)
- 2026-10-18T03:23:51Z · note: shots: skipped — 5 handoff shots already captured for this exact plan (2f5c5bc1d) during finalization (#0734)
- 2026-10-18T03:25:06Z · note: review pass 2: needs some work
- 2026-10-18T03:25:07Z · status review→active
- 2026-10-18T03:26:17Z · body
- 2026-10-18T03:26:45Z · body
- 2026-10-18T03:29:40Z · body
- 2026-10-18T03:36:48Z · body
- 2026-10-18T03:47:54Z · status active→review
- 2026-10-18T03:47:54Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-10-18T03:48:12Z · note: waitFor .activity-animation-preview .ai-style-bird-quick-trail: waitFor: Timeout 5000ms exceeded. on /settings?tab=general
- 2026-10-18T03:48:12Z · note: highlight .activity-animation-preview .ai-style-bird-quick-trail matched nothing on /settings?tab=general
- 2026-10-18T03:49:45Z · note: review pass 3: needs some work
- 2026-10-18T03:49:45Z · needs_input
- 2026-10-18T04:26:12Z · status review→active, needs_input
- 2026-10-18T04:26:12Z · note: close-out repair: merge-conflict
- 2026-10-18T04:28:19Z · body
- 2026-10-18T04:37:13Z · status active→review
- 2026-10-18T04:37:13Z · note: Task body is underspecified: missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI
- 2026-10-18T04:37:33Z · note: waitFor .activity-animation-preview .ai-style-bird-quick-trail: waitFor: Timeout 5000ms exceeded. on /settings?tab=general
- 2026-10-18T04:37:33Z · note: highlight .activity-animation-preview .ai-style-bird-quick-trail matched nothing on /settings?tab=general
- 2026-10-18T04:38:51Z · note: review pass 4: needs some work
- 2026-10-18T04:38:52Z · needs_input
- 2026-10-18T05:37:09Z · body: Problem (added)
- 2026-10-18T05:37:13Z · body: Desired UX (added)
