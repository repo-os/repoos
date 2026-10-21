---
id: "0833"
title: "Add RGB keystorm, Wheelie courier, and Halloween activity animations"
type: feature
status: done
priority: p2
area: [web, core]
merged_commit: aff1b21cce0249f78d14415853df4ff89ffb0f1c
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/add-rgb-keystorm-wheelie-courier-and-hal
created_at: "2026-10-18T08:58:09Z"
updated_at: "2026-10-21T16:53:28Z"
last_close_out_gate_ms: 352245
last_close_out_gate_at: "2026-10-18T13:47:21.769Z"
review_passes: 2
---
## Problem

The human approved four animations explored in this chat and explicitly requested a new task to implement them: **RGB keystorm** (called “rgb storm” by the human), **Wheelie courier**, **Boo swoop**, and **Pumpkin spell**. These should be intricate, curved and multicolored, with clear active movement at compact sizes. Add only these four; Midnight hacker and Café racer were not selected.

Related work: #0787 / #0798 established the shared style system, #0807 added hopper/paws, #0813 added configurable size, and #0819 includes bird tracks. Reuse the current shared system and sizing configuration.

## Desired UX

Add four choices to the existing Settings Activity animation selector and corresponding repoos.toml validated enum, retaining all current choices and the current default:

1. **RGB keystorm** (`rgb-keystorm`): curved ergonomic keyboard with individually lit keys in a moving cyan/pink/green/purple wave; four rounded typing fingers alternate up/down above it, and tiny colored code glyphs stream upward. Preserve simultaneous key-wave, typing and code motion.
2. **Wheelie courier** (`wheelie-courier`): a recognizable motorcycle and crouched helmeted rider with curved fuel tank, bent limbs, two spinning spoked wheels, suspension bounce, streaming road marks and exhaust. The front wheel rises and settles in repeated controlled wheelies while a scarf ripples behind. Preserve the rider/bike proportions and curved details; do not replace it with an emoji, boxy silhouette, bicycle or generic spinning wheel.
3. **Boo swoop** (`boo-swoop`): a rounded pale ghost swoops and banks, with independently waving arms, a continuously rippling ragged hem, dark oval eyes/open mouth, pink cheeks, and three small colorful wisps circling around it.
4. **Pumpkin spell** (`pumpkin-spell`): a lobed orange jack-o’-lantern with rib details, carved glowing eyes/grin, and a curved floppy purple witch hat with green band. The pumpkin bounces and rocks, its eyes glow gently, and multicolored sparks rise around it. No rapid strobing.

Approved reference: /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/neon-road-haunted-motion.html. The human explored the preview at 3ch width and 18px label text, but this does not authorize changing application label sizes or global defaults. Detail is strongest at 3ch: provide readable silhouettes and obvious whole-shape motion at small real task-label sizes, and ensure the existing 1–3ch preference works correctly. Do not silently enlarge indicators beyond the selected slot. Use the established Auto size convention; absent a more appropriate established convention, use 2ch Auto and let users choose 3ch for detail.

These four concepts intentionally introduce theme-aware multicolor artwork. Preserve the selected color relationships (RGB keyboard, scarf/bike accents, pale ghost/pink cheeks, orange pumpkin/purple hat/green magic) using existing theme tokens or appropriate theme-aware artwork colors. Do not flatten everything to the current single activity color. Preserve status-label/reviewing color semantics outside the artwork, and maintain readable light/dark appearance.

## Notes for AI

Extend the shared ActivityIndicator, stable config enum/schema options, Settings preview, persistence/validation, and directly affected user documentation. Render the approved art with code-native curves and shapes; no runtime dependencies or network assets. The prototype uses Canvas paths/curves and color palettes, but its rendering engine is a reference rather than a requirement. A production implementation may adapt it to an appropriate local rendering approach if visual fidelity, animation layering and proportions are preserved.

Use the current shared size scaling/animation-envelope rules, not just a width increase that leaves tiny artwork unchanged. Existing animation choices, default, label sizes and animation preferences must remain unchanged. In the reference, coding uses base timing, reviewing uses 0.78 × base animation speed, and general work 0.9 ×; keep the same distinction unless the current component conventions require an equivalent integration.

Performance/lifecycle: do not create an unbounded animation loop per card. Stop/release loops and resources when unmounted; suspend invisible/hidden/offscreen indicators and when the page is hidden, following current shared patterns. Respect reduced motion with an attractive static recognizable pose (not blank or transparent artwork). Keep accessible activity labels and avoid announcing frames.

The local reference may be unavailable on remote runners. The drawing functions below are copied from the approved prototype, in a 128×128 logical coordinate space, and form the durable visual/motion reference. They deliberately include reference palette colors; translate those to theme-aware production colors rather than adding hard-coded palette values to the application's global stylesheet. Supply the draw function with the activity-scaled elapsed time, keep drawing independent of label size, and fit the complete art plus motion within the selected slot. `bike(c,t,p,true)` is Wheelie courier; the false branch is unselected reference machinery, not another style to expose.

```js
// isDark: current theme appearance; c: Canvas 2D context; t: elapsed seconds.
function palette(){return isDark?{cyan:'#65edff',pink:'#ff83ca',green:'#b4ff96',purple:'#bca1ff',ink:'#14263c',white:'#f1f5ff',orange:'#ffad52',edge:'#687e9a'}:{cyan:'#007f9e',pink:'#ca247c',green:'#308648',purple:'#7043bc',ink:'#edf1f9',white:'#effbff',orange:'#db7014',edge:'#52647f'}}
function line(c,points,color,width=3){c.beginPath();c.moveTo(...points[0]);for(let i=1;i<points.length;i++)c.lineTo(...points[i]);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke()}
function ellipse(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill()}
function path(c,color,fn,stroke){c.beginPath();fn(c);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke()}}
function keyboard(c,t,p,y=91){
path(c,p.edge,g=>{g.moveTo(20,y-8);g.quadraticCurveTo(64,y-19,108,y-8);g.lineTo(116,y+13);g.quadraticCurveTo(64,y+24,12,y+13);g.closePath()});
path(c,p.ink,g=>{g.moveTo(23,y-5);g.quadraticCurveTo(64,y-14,105,y-5);g.lineTo(110,y+9);g.quadraticCurveTo(64,y+18,18,y+9);g.closePath()});
const colors=[p.cyan,p.pink,p.green,p.purple];
for(let row=0;row<3;row++)for(let col=0;col<8;col++){const x=27+col*10.5+(row%2)*2,y1=y-3+row*6;const wave=(Math.sin(t*7-col*.8-row)+1)/2;c.globalAlpha=.35+.65*wave;ellipse(c,x,y1,3.4,1.9,colors[(col+row)%4]);}c.globalAlpha=1;
line(c,[[47,y+14],[80,y+14]],p.cyan,2);
}
function code(c,t,p){const colors=[p.cyan,p.pink,p.green];for(let i=0;i<6;i++){const y=10+((t*45+i*19)%75),x=14+i*18;c.globalAlpha=.3+.6*(1-y/100);c.fillStyle=colors[i%3];c.font='500 11px monospace';c.fillText(i%2?'01':'<>',x-5,y);}c.globalAlpha=1;}
function keys(c,t,p){code(c,t,p);keyboard(c,t,p);for(let i=0;i<4;i++){const x=37+i*18,y=64+Math.sin(t*11+i*1.6)*9;path(c,i%2?p.pink:p.cyan,g=>{g.moveTo(x-5,y+14);g.bezierCurveTo(x-10,y-10,x-5,y-18,x,y-17);g.bezierCurveTo(x+8,y-16,x+5,y,x+5,y+14);g.closePath()});ellipse(c,x,y-10,2,4,p.white);}}
function wheel(c,x,y,t,p){ellipse(c,x,y,15,15,p.edge);ellipse(c,x,y,11,11,p.ink);c.save();c.translate(x,y);c.rotate(t*15);for(let a=0;a<3;a++){const q=a*Math.PI*2/3;line(c,[[0,0],[Math.cos(q)*10,Math.sin(q)*10]],p.white,2)}ellipse(c,0,0,3,3,p.orange);c.restore();}
function bike(c,t,p,wheelie){
for(let i=0;i<3;i++){const x=8+((i*37-t*90)%108+108)%108;line(c,[[x,111+i*3],[x+14,111+i*3]],p.edge,2)}
c.save();c.translate(0,Math.sin(t*16)*1.8);if(wheelie){c.translate(28,93);c.rotate(-(.13+(Math.sin(t*3.5)+1)*.12));c.translate(-28,-93)}
wheel(c,28,94,t,p);wheel(c,101,94,t,p);
line(c,[[28,94],[52,73],[72,91],[28,94]],p.orange,4);line(c,[[72,91],[87,64],[101,94]],p.cyan,4);line(c,[[86,64],[93,61],[99,64]],p.white,3);
path(c,p.cyan,g=>{g.moveTo(49,69);g.bezierCurveTo(55,51,77,53,80,67);g.quadraticCurveTo(66,75,49,69)});line(c,[[35,70],[51,70]],p.white,5);ellipse(c,61,85,10,8,p.edge);line(c,[[38,94],[64,96]],p.white,3);
// Bent legs and arms; helmet and tucked torso move with the suspension.
line(c,[[51,55],[48,74],[67,87],[73,86]],p.purple,7);line(c,[[52,56],[69,43],[82,63],[91,65]],p.pink,6);line(c,[[49,57],[64,41]],p.purple,13);
ellipse(c,72,30,12,12,p.white);path(c,p.ink,g=>{g.moveTo(71,24);g.quadraticCurveTo(85,22,84,32);g.lineTo(72,34);g.closePath()});
if(wheelie){path(c,p.pink,g=>{g.moveTo(62,37);g.bezierCurveTo(48,31+Math.sin(t*10)*6,38,43,25,31);g.quadraticCurveTo(41,48,64,43);g.closePath()})}
c.restore();
for(let i=0;i<3;i++){const f=(t*2+i*.32)%1;c.globalAlpha=(1-f)*.45;ellipse(c,17-f*12,91-f*12,2+f*5,2+f*3,p.edge)}c.globalAlpha=1;
}
function ghost(c,t,p){
for(let i=0;i<3;i++){const a=t*2+i*2.1;ellipse(c,64+Math.cos(a)*44,65+Math.sin(a)*39,2.5,2.5,[p.pink,p.cyan,p.purple][i])}
c.save();c.translate(64+Math.sin(t*2.4)*9,65+Math.cos(t*3.2)*9);c.rotate(Math.sin(t*2.4)*.2);
const wave=Math.sin(t*7)*5;
path(c,p.white,g=>{g.moveTo(-30,22);g.bezierCurveTo(-36,-10,-24,-42,0,-42);g.bezierCurveTo(26,-43,37,-16,29,22);g.quadraticCurveTo(37,33,30,34);g.quadraticCurveTo(20,26+wave,13,35);g.quadraticCurveTo(2,24-wave,-7,34);g.quadraticCurveTo(-17,25+wave,-26,34);g.closePath()});
path(c,p.white,g=>{g.moveTo(-24,-9);g.quadraticCurveTo(-46,-8-wave,-43,8);g.quadraticCurveTo(-36,16,-22,5);g.closePath()});path(c,p.white,g=>{g.moveTo(25,-9);g.quadraticCurveTo(48,-21+wave,43,-3);g.quadraticCurveTo(38,8,23,5);g.closePath()});
ellipse(c,-11,-12,5,8,p.ink);ellipse(c,11,-12,5,8,p.ink);ellipse(c,0,6,6,8,p.ink);ellipse(c,-20,0,5,3,p.pink);ellipse(c,20,0,5,3,p.pink);c.restore();
}
function pumpkin(c,t,p){
for(let i=0;i<5;i++){let f=(t*.7+i*.2)%1;c.globalAlpha=Math.sin(f*Math.PI);const x=20+i*22+Math.sin(t*3+i)*6,y=110-f*101;line(c,[[x-2,y],[x+2,y]],i%2?p.green:p.orange,2);line(c,[[x,y-2],[x,y+2]],i%2?p.green:p.orange,2)}c.globalAlpha=1;
c.save();c.translate(64,76+Math.sin(t*5)*5);c.rotate(Math.sin(t*3)*.12);
ellipse(c,-17,4,24,28,p.orange);ellipse(c,17,4,24,28,p.orange);ellipse(c,0,4,24,30,p.orange);
c.globalAlpha=.35;for(let x of [-19,19]){c.beginPath();c.ellipse(x,4,11,27,0,Math.PI*.55,Math.PI*1.45);c.strokeStyle=p.ink;c.lineWidth=2;c.stroke()}c.globalAlpha=1;
const glow=.75+.25*Math.sin(t*6);c.fillStyle=p.ink;path(c,p.ink,g=>{g.moveTo(-26,0);g.quadraticCurveTo(-17,-15,-8,-3);g.lineTo(-17,3);g.closePath()});path(c,p.ink,g=>{g.moveTo(8,-3);g.quadraticCurveTo(17,-15,26,0);g.lineTo(17,3);g.closePath()});
path(c,p.ink,g=>{g.moveTo(-26,12);g.quadraticCurveTo(0,38,26,12);g.lineTo(13,18);g.lineTo(9,11);g.lineTo(2,21);g.lineTo(-4,14);g.lineTo(-12,21);g.closePath()});c.globalAlpha=glow;ellipse(c,-17,-2,3,2,p.green);ellipse(c,17,-2,3,2,p.green);c.globalAlpha=1;
path(c,p.purple,g=>{g.moveTo(-30,-18);g.quadraticCurveTo(-14,-29,-8,-61);g.bezierCurveTo(6,-54,7,-73,23,-56);g.quadraticCurveTo(8,-58,20,-23);g.quadraticCurveTo(36,-20,30,-15);g.quadraticCurveTo(0,-9,-30,-18)});line(c,[[-16,-27],[18,-24]],p.green,5);c.restore();
}

```

## Acceptance criteria

- All four new named choices appear in Settings, preview immediately, persist across reload, and round-trip through repoos.toml. Test the stable enum/config defaults, valid new values and invalid value handling. Existing styles/default and saved size preferences remain intact.
- Compare each running implementation directly with the approved reference source: preserve shape proportions, curved silhouettes, intentional multicolor relationships, and all listed simultaneous motion layers. No emoji or static/generic icon substitutions.
- Browser verification renders the actual shared component for each style and coding/reviewing/agent states, checks state timing, visible animation over time, and functional Settings selection. Screenshots alone cannot verify motion fidelity.
- Verify actual 9–12px task-label contexts at compact sizes and 3ch, plus the Settings preview. Ensure artwork and movement scale together, stay within the full allocated envelope, do not overlap labels, and remain aligned in narrow task cards/drawers.
- Check representative light/dark themes for legibility of faces, carved features, rims/spokes, keyboard colors and decorative trails. Labels keep existing activity colors.
- Reduced motion stops all motion and leaves each subject clearly recognizable. Test mount/unmount and offscreen/hidden behavior to prevent leaked animation loops and unnecessary background CPU with many task cards.
- Capture Settings and real task-card evidence, rebuild after UI changes, run focused meaningful tests and scoped repoos check, and hand off through normal review.

## Shots
```json
[
{
"label": "RGB keystorm in the Settings activity-animation preview",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": ".activity-animation-preview",
"state": "settings:rgbKeystorm"
},
{
"label": "Wheelie courier in the Settings activity-animation preview",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": ".activity-animation-preview",
"state": "settings:wheelieCourier"
},
{
"label": "Boo swoop in the Settings activity-animation preview",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": ".activity-animation-preview",
"state": "settings:booSwoop"
},
{
"label": "Pumpkin spell in the Settings activity-animation preview",
"target": "default",
"route": "/settings?tab=general&section=activity-animation",
"highlight": ".activity-animation-preview",
"state": "settings:pumpkinSpell"
}
]
```

## Activity

- 2026-10-18T08:58:09Z · created · njachowski@gmail.com
- 2026-10-18T09:09:36Z · status inbox→ready
- 2026-10-18T12:23:20Z · status ready→active, branch
- 2026-10-18T12:28:41Z · message_queued at 2026-10-18T12:28:41.781Z
- 2026-10-18T12:28:41Z · CTO nudge: sent engineer a completion reminder after 5m without worktree activity
- 2026-10-18T13:00:55Z · body
- 2026-10-18T13:10:15Z · body
- 2026-10-18T13:11:13Z · body
- 2026-10-18T13:14:27Z · body
- 2026-10-18T13:26:19Z · status active→review
- 2026-10-18T13:27:19Z · note: review pass 1: needs some work
- 2026-10-18T13:28:39Z · note: review pass 2: good to go
- 2026-10-18T13:32:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T13:47:21Z · close-out gate completed in 352s
- 2026-10-18T13:47:57Z · status review→done, release:success
- 2026-10-18T14:16:58Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T16:43:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T17:21:14Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T18:26:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T18:57:48Z · message_overdue: still queued after 60m without being delivered
- 2026-10-18T19:02:49Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T02:46:49Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T07:51:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T13:55:06Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T14:51:11Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T15:43:30Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T16:19:53Z · message_overdue: still queued after 60m without being delivered
- 2026-10-19T19:46:46Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T04:26:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T11:08:20Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T15:31:55Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T16:09:57Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T17:21:44Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T18:33:39Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T19:47:05Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T20:10:43Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:10:04Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T21:57:00Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T22:12:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:15:29Z · message_overdue: still queued after 60m without being delivered
- 2026-10-20T23:17:42Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T00:05:52Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T01:05:50Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T02:04:02Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T04:15:07Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T08:22:54Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:51:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T11:59:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T13:14:35Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T14:32:41Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:04:32Z · message_overdue: still queued after 60m without being delivered
- 2026-10-21T16:53:28Z · message_overdue: still queued after 60m without being delivered
