---
id: "1148"
title: "Settings mobile navigation: reduce repeated topic-chip density"
type: chore
status: active
priority: p2
area: web
assigned_to: ai
created_by: t@t
branch: feat/settings-mobile-navigation-reduce-repeat
created_at: "2026-11-17T03:06:33Z"
updated_at: "2026-11-17T05:32:58Z"
check_retry_count: 1
last_check_failure: "repoos check at 2026-11-17T05:13:57.562Z: repoos check failed: rendered-contrast — · div#setting-release.email.to.setting-row > div.setting-info > div.setting-desc — #686e76 on #161b23 = 3.36 (need ≥4.5, 11px) [settings] \"Addresses that receive each release email, one message per a\""
review_rounds: 1
routing_switches: 1
review_passes: 1
---
## Problem
At 390×844, /settings shows a six-item page navigation grid, followed by a long wrapping row of topic chips (Themes, Activity animation, General, Performance, Model routing, Close-out, Automation & approval, Screenshots, Attachments, Background service, Publishing, Release emails, Remote validation, Board, and more). Both layers consume most of the initial viewport before selected setting controls.

## Desired UX
A phone user can reach a setting category and its controls with less scanning and scrolling while retaining search and section context.

## Acceptance criteria
- At 390px the initial view presents one clear navigation layer and useful selected-section content.
- Secondary topics remain discoverable and the active section is clear.
- Keyboard and touch navigation remain usable.
- Desktop composition is unchanged.

## Notes for AI
Use the attached phone screenshot. Check long labels and both theme families. This is a follow-up refinement to the completed mobile Settings composition work.

## Shots
```json
[
{
"label": "Phone 390px: single tab rail beside the collapsed Sections control",
"target": "default",
"route": "/settings",
"highlight": ".settings-mobile-nav",
"assert": [
{
"selector": ".settings-mobile-nav-btn",
"label": "all seven page tabs remain in the phone rail",
"count": 7
},
{
"selector": ".settings-section-jump-btn",
"label": "sections live behind one compact control",
"text": "Browse all"
}
],
"theme": "light",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Phone 390px dark: section list open, long labels intact",
"target": "default",
"route": "/settings",
"highlight": ".settings-section-nav--phone",
"steps": [
{
"click": ".settings-section-jump-btn"
},
{
"waitMs": 250
}
],
"assert": [
{
"selector": ".settings-section-nav--phone .settings-section-chip",
"label": "every General section stays reachable",
"minCount": 14
},
{
"selector": ".settings-section-nav--phone",
"label": "long section labels render",
"text": "Automation & approval"
}
],
"theme": "dark",
"viewportWidth": 390,
"viewportHeight": 844
},
{
"label": "Desktop Settings composition unchanged",
"target": "default",
"route": "/settings",
"highlight": ".settings-section-nav",
"assert": [
{
"selector": ".settings-tabs .settings-tab-btn",
"label": "desktop tab strip is intact",
"minCount": 7
}
],
"theme": "light",
"viewportWidth": 1440,
"viewportHeight": 900
}
]
```

## Screenshots

![Settings at 390×844: two stacked navigation layers dominate first view](/api/tasks/1148/attachments/att_a0b17ef0-cf2f-4c7b-8d34-36bcc937fede.png)

## Activity

- 2026-11-17T03:06:33Z · created · t@t
- 2026-11-17T03:06:35Z · screenshots
- 2026-11-17T03:06:37Z · needs_input
- 2026-11-17T03:07:49Z · body: Problem (added); Desired UX (added); Acceptance criteria (added); Notes for AI (added)
- 2026-11-17T03:46:34Z · needs_input
- 2026-11-17T03:46:38Z · status inbox→ready
- 2026-11-17T03:46:41Z · status ready→active, branch
- 2026-11-17T04:02:53Z · body
- 2026-11-17T04:08:19Z · body
- 2026-11-17T04:20:09Z · body
- 2026-11-17T04:35:14Z · body
- 2026-11-17T04:44:29Z · note: ui verification passed: 3 of 3 shots captured with clean console
- 2026-11-17T04:44:32Z · status active→review
- 2026-11-17T04:44:32Z · message_queued at 2026-11-17T04:44:32.962Z
- 2026-11-17T04:50:30Z · note: review pass 1: needs some work
- 2026-11-17T04:50:32Z · message_delivered: 1 message(s)
- 2026-11-17T04:50:32Z · status review→active
- 2026-11-17T04:58:52Z · body
- 2026-11-17T05:08:39Z · body
- 2026-11-17T05:13:54Z · message_queued at 2026-11-17T05:13:54.345Z
- 2026-11-17T05:13:57Z · message_delivered: 1 message(s)
- 2026-11-17T05:15:55Z · body
- 2026-11-17T05:25:31Z · CTO nudge: held — machine under pressure (system load is high (27.6× per CPU, limit 3×) — waiting for headroom before starting more work)
- 2026-11-17T05:32:58Z · body
