---
id: "0819"
title: "Easter eggs bundle: shot warnings, viewer status, and bird tracks"
type: bug
status: ready
priority: p3
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: ""
created_at: "2026-10-17T12:52:42Z"
updated_at: "2026-10-17T13:17:57Z"
---
## Problem
When a change touches documentation, the handoff capture tries the Docs site preview target. If no declared shot names a docs route, the target is skipped, and the Changes tab shows '[shot-warning] declared shot not captured — Docs site matched only documentation content, and no declared shot names a route — docs captures need a declared route, so this target was skipped'. The wording is hard to act on. The screenshot viewer also shows only the image, not the green check or the warning, so the status is hidden when you open a shot.

## Desired UX
- The skipped docs warning reads: 'Docs site skipped: no docs shot declared', with a short link that explains how to declare a docs route for the task.
- The screenshot viewer header shows the shot's check (or cross) and any warning for that shot, the same as the row in the Changes list.

## Acceptance criteria
- Test: a docs-only change with no declared docs shot shows the new warning text and the declare link.
- Test: the screenshot viewer shows the shot's check and warning in its header.
- Light and dark themes checked on the warning and the viewer header.

## Notes for AI
Start from the shot-warning text in the handoff capture code (grep for 'docs captures need a declared route') and the screenshot viewer (grep for 'Screenshots' and 'Wider images scale down'). Source: user report 2026-10-17 on #0817's Changes tab.

## Bird quick trail animation (third bundle item)
Source: human request in this chat, 2026-10-17. Add this as the third independent item in the bundle, alongside the existing docs-skipped warning and screenshot-viewer status fixes. The human selected only **Bird · quick trail**; do not add mouse, rabbit or other animal concepts. Related animation work: #0787, #0798, #0807 and size configuration #0813.

### Fix

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

### Test and verification for this item

- Config round-trip accepts `bird-quick-trail`; the option appears in the styled Settings selector and persists after reload without changing the existing default.
- Browser verification renders the real component for coding, reviewing and generic work, checks computed keyframes/periods and staggered delays, and reduced-motion stopping. Avoid tests that only assert class names or raw stylesheet text.
- Inspect the animation over time and compare against the approved quick-trail reference at actual 9–12px label sizes. Verify two distinct tapered, splayed footprints, the fast alternating step rhythm, current light/dark activity colors, size preference support, and no clipping, label overlap or layout shifts.
- Capture Settings and actual task-card evidence. Commit this item separately from the other bundle items, then run the bundle's scoped repoos check and normal review workflow.

## Screenshots

![Approved bird-track shape reference: tapered central toe, splayed side toes, and short heel](/api/tasks/0819/attachments/screenshot-1.png)

## Activity

- 2026-10-17T12:52:42Z · created · njachowski@gmail.com
- 2026-10-17T12:52:46Z · status inbox→ready
- 2026-10-17T13:17:57Z · title, body: section Bird quick trail animation (third bundle item)
- 2026-10-17T13:17:57Z · screenshots
