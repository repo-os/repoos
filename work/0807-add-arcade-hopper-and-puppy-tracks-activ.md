---
id: "0807"
title: Add Arcade hopper and Puppy tracks activity animations
type: feature
status: review
priority: p2
area: [web, core]
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/add-arcade-hopper-and-puppy-tracks-activ
created_at: "2026-10-16T09:55:07Z"
updated_at: "2026-10-16T11:59:42Z"
---
## Problem

The human approved **Arcade hopper** and **Puppy tracks** from the animated concepts in this chat and explicitly requests a RepoOS task to add those two styles. At RepoOS's small label sizes, whole-shape movement is easier to see than subtle movement inside a mostly static icon.

Follow on from #0787 and the sizing/motion polish in #0798. Add only these two approved concepts; the ball, comet, and other concepts are outside this task.

## Desired UX

Add two more choices to the existing Activity animation Settings dropdown and repoos.toml enum:

- **Arcade hopper** (`arcade-hopper`): a chunky monochrome arcade alien silhouette, with two antennae, two cutout eyes, and blocky feet. For coding it jumps in place, squashes on landing, and tilts left then right at the apex. Reviewing uses a left/right lean and small sideways peek instead of the jump. Generic agent work uses the jumping motion at a slightly slower pace.
- **Puppy tracks** (`puppy-tracks`): two clearly recognizable paw prints on a diagonal, each with a solid pad and four toes. They alternate large/small, bright/faint stamps so the complete prints visibly take steps. Reviewing uses a wider alternating rotation like a sniff/search motion. Generic work keeps the stepping motion at a slightly slower pace.

Match the approved preview, including timing, geometry and motion; do not substitute a generic dog icon, a bouncing dot, or a different arcade character. Keep the compact **2ch** reserved slot and approximately **1.1em** height, with no motion outside that slot and no layout shifts. Verify readability at real 9–12px task-label sizes as well as the larger preview.

Use the existing activity/theme color tokens and currentColor; reviewing continues using the existing reviewing color. Eye cutouts must show the actual underlying surface across themes. Keep all existing style choices and the current Orbital pixel default. Both additions must work wherever the shared ActivityIndicator is used, with coding/reviewing/general-agent motion applied correctly to the actual DOM.

## Notes for AI

Reference prototype: /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/bold-agent-motion.html. This path may be unavailable on remote runners, so the approved geometry and animation source are reproduced below. The prototype's colors and surrounding presentation are illustrative; production should use current app tokens and its existing Settings preview. Do not change the two approved designs while translating the implementation.

The prototype renders a 2ch-wide, 1.1em-high inline slot with position:relative; each .art fills that slot, also position:relative. Hopper markup is `.art.hopper > i.body`; paw markup is `.art.paws > i.body + i.other`. No SVG or runtime dependencies are required. Map the prototype classes to the shared component conventions. --cycle is 1s for coding, 1.35s for reviewing, and 1.2s for generic agent work. .review denotes the parent reviewing state. --b-bg means the actual surface behind the mark, not a new fixed palette.

```css
.hopper .body{position:absolute;width:.92em;height:.65em;left:calc(50% - .46em);bottom:.06em;background:currentColor;clip-path:polygon(18% 0,28% 0,28% 15%,72% 15%,72% 0,82% 0,82% 25%,100% 25%,100% 78%,82% 78%,82% 100%,63% 100%,63% 78%,37% 78%,37% 100%,18% 100%,18% 78%,0 78%,0 25%,18% 25%);animation:b-hop var(--cycle) ease-in-out infinite}
.hopper .body::after{content:'';position:absolute;left:24%;top:40%;width:14%;height:18%;background:var(--b-bg);box-shadow:.34em 0 0 var(--b-bg)}
.review .hopper .body{animation-name:b-peek}
.paws .body,.paws .other{position:absolute;width:.58em;height:.55em;left:.04em;top:.02em;animation:b-step var(--cycle) ease-in-out infinite}
.paws .other{left:auto;right:.04em;top:auto;bottom:.02em;animation-delay:calc(var(--cycle)*-.5)}
.paws .body::before,.paws .other::before{content:'';position:absolute;left:.12em;bottom:0;width:.34em;height:.28em;background:currentColor;border-radius:55% 55% 40% 40%}
.paws .body::after,.paws .other::after{content:'';position:absolute;left:.02em;top:.12em;width:.12em;height:.16em;border-radius:50%;background:currentColor;box-shadow:.13em -.1em 0 currentColor,.29em -.1em 0 currentColor,.42em 0 0 currentColor}
.review .paws .body,.review .paws .other{animation-name:b-sniff}
@keyframes b-hop{0%,100%{transform:translateY(0) scaleY(.8)}35%{transform:translateY(-.33em) rotate(-14deg)}65%{transform:translateY(-.33em) rotate(14deg)}}
@keyframes b-peek{0%,100%{transform:translateX(-.09em) rotate(-18deg)}50%{transform:translateX(.09em) rotate(18deg)}}
@keyframes b-step{0%,100%{transform:translateY(.05em) scale(.65) rotate(-15deg);opacity:.2}35%,55%{transform:translateY(0) scale(1) rotate(10deg);opacity:1}}
@keyframes b-sniff{0%,100%{transform:scale(.65) rotate(-25deg);opacity:.25}40%,60%{transform:scale(1) rotate(25deg);opacity:1}}
```

Extend the existing validated config enum, schema options, config persistence, and shared Settings preview in the same change. Use the existing styled dropdown. Update directly affected user documentation with the two option names and values. Respect prefers-reduced-motion: both styles must become recognizable static marks; retain both paw prints visibly, with the second one dimmer. Keep accessible activity labels and do not announce animation frames. Do not expand this into a general Settings redesign or change the default.

## Acceptance criteria

- Both new styles are selectable in Settings and via repoos.toml, persist across reload, and appear in the existing live coding/reviewing/agent preview. Existing selections and default behavior remain unchanged.
- Hopper and paw motion matches the approved source above in each state; the complete silhouette/print moves visibly at the actual task-card size. The two new options inherit existing activity colors in light/dark themes.
- Browser verification exercises the real component for both styles × all three activity states and checks computed animation names/durations, catching parent/child selector mistakes rather than checking only classes or stylesheet strings.
- Verify 2ch width and full animated bounds at the smallest normal label size, no overlapping labels or layout shifts, and legible eye cutouts against actual themed surfaces.
- Reduced-motion verification confirms all parent/child animations stop and marks remain visible. Inspect motion over time; screenshots alone do not prove animation fidelity. Capture Settings and real task-card evidence.
- Rebuild after UI changes, run focused meaningful tests and the scoped repoos check, and hand off through normal RepoOS review.

## Shots
```json
[
{
"label": "Activity animation settings: Arcade hopper and Puppy tracks now in the dropdown",
"target": "default",
"route": "/settings?focus=activityAnimationStyle",
"highlight": "#setting-activityAnimationStyle",
"steps": [
{
"click": "#setting-activityAnimationStyle button[role=\"combobox\"]"
},
{
"waitMs": 500
}
]
}
]
```

## Activity

- 2026-10-16T09:55:07Z · created · njachowski@gmail.com
- 2026-10-16T09:58:50Z · status inbox→ready
- 2026-10-16T10:25:37Z · status ready→active, branch
- 2026-10-16T10:41:38Z · message_queued at 2026-10-16T10:41:38.967Z
- 2026-10-16T10:41:39Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-16T11:44:32Z · body
- 2026-10-16T11:46:42Z · body: section Shots
- 2026-10-16T11:49:46Z · body
- 2026-10-16T11:51:23Z · body
- 2026-10-16T11:55:07Z · message_expired: not delivered within timeout
- 2026-10-16T11:58:49Z · status active→review
- 2026-10-16T11:59:42Z · note: review pass 1: good to go
