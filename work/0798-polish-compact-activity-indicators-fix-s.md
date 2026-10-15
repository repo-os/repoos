---
id: "0798"
title: "Polish compact activity indicators: fix state motions and improve visible size"
type: bug
status: active
priority: p2
area: web
assigned_to: ai
created_by: njachowski@gmail.com
branch: feat/polish-compact-activity-indicators-fix-s
created_at: "2026-10-15T10:08:29Z"
updated_at: "2026-10-15T11:08:40Z"
---
## Problem

Follow-up to #0787 (now done). The human compared the shipped Activity animation Settings preview with the original animated concepts and found the shipped indicators less polished and too small. They approve a follow-up fixing the motion and improving visible size, keeping the compact 1–2 character-width goal and existing activity/theme colors.

Source screenshot attached: Screenshot 2026-10-15 at 17.03.10.png. The earlier screenshot (also attached) shows the original three-dot indicator and compactness problem. Original motion prototype: /Users/nick/.codex/visualizations/2026/10/15/01a13ddd-613e-7170-8b22-eeb1a3ef9857/compact-agent-motion.html (local reference only; the specification below must stand on its own on remote runners).

Confirmed source issue: ActivityIndicator.vue applies ai-motion-coding/reviewing/agent to the outer .ai wrapper, while the CSS uses same-element selectors such as .ai-motion-reviewing.ai-orbit::after against the inner .ai-mark. Those rules do not match the rendered DOM. Reviewing and generic agent motions fall back to coding motion; analogous selectors affect the other styles and some reduced-motion rules.

Sizing issue: Orbital pixel already reserves 1.5ch, but its ring is only 0.75em with a 1px border, giving an approximately 11px outside diameter at 12px text versus approximately 14px in the 16px prototype. Increasing the reserved width alone will not make the visible glyph larger.

## Desired UX

- Keep Orbital pixel as the default, all seven existing options, and the existing Settings/repoos.toml configuration contract.
- Make all activity-specific motions actually work. Orbital coding: 1.6s linear orbit; reviewing: 2s diagonal scan inside the ring; generic agent: 2.6s orbit. Restore each family's distinctions: caret/scan/breathing dot; angle/square/breathing brackets; pulsing/scanning/rotating matrix; typing/scanning/slow-wave bars; spark/diamond/slower spark. Preserve the original three-dot option.
- Use 1.5ch as the preferred compact footprint for Orbital pixel and any currently 1ch family that benefits from a little more room; retain up to 2ch for brackets. Size the visible glyph independently of the label's small text. Target a roughly 12–14px orbital ring outside diameter and a clearly visible ~3px dot at normal UI scale, adjusting the exact geometry to fit the reserved slot and its motion without clipping, overlap, or layout shift. A 1.5ch reservation is a target, not justification to draw outside its bounds: permit up to 2ch where actual font metrics require it.
- Tune the other compact styles proportionately so none becomes a faint speck in real task cards. Keep motion restrained and distinguishable, without making every style the same size/shape or increasing the legacy spacing problem.
- Preserve current working/reviewing/other activity color tokens in each theme. Do not copy the prototype's uniform blue palette. Make the moving mark clearly legible against its actual background; keep the orbit track subordinate to the moving dot, tuning opacity rather than replacing the palette.
- Improve the Settings preview so it faithfully shows actual in-app size and all three distinct motions. Keep normal-size readable labels and consistent alignment/gap; use less visually competing nested framing and redundant heading/copy if consistent with Settings conventions. Do not enlarge only the Settings demo while leaving task-card indicators tiny. Avoid an unrelated Settings redesign.
- Honor reduced motion with a stable, legible mark for every style/state, including parent-applied matrix/bracket animation. Preserve accessible labels and do not announce animation frames.

## Notes for AI

- Work in a new task worktree; do not modify the completed #0787 branch. Start with src/ui-app/src/components/ActivityIndicator.vue and the activity-indicator/Settings-preview blocks in src/ui-app/src/style.css, plus SettingsView.vue only as needed.
- Fix selectors to match the real parent/child structure, or deliberately move motion classes to the animated mark. Audit all six families and reduced-motion selectors together; changing only Orbital pixel leaves the same regression elsewhere.
- Confirm generic working consumers actually receive agent motion where semantically appropriate; preview-only props are not enough. Keep existing activity-state semantics.
- Use shared sizing rules and inherited colors. Prefer no new user configuration: this is a fix/polish pass on the existing setting.
- Scope documentation updates to any behavior/configuration descriptions directly affected. Rebuild after UI changes; run scoped repoos check before review.

## Acceptance criteria

- Browser-level regression verification renders the real component and checks computed animation names/durations for coding, reviewing, and agent variants across all six new styles. Tests must catch the current parent/child selector failure rather than only assert class names or stylesheet text.
- Orbital pixel visibly orbits for coding, scans for reviewing, and uses the slower agent orbit. Other families show their specified state distinctions.
- At actual task-card and Settings-preview sizes, indicators are clearly readable, remain within a measured 1–2ch compact allocation including motion, and neither overlap labels nor introduce layout shifts. Check the smallest normal label context and narrow cards.
- Reduced-motion browser verification confirms no descendant or wrapper animation remains active for any new family and every style retains a visible static mark.
- Verify representative light/dark themes, current working/reviewing colors, and moving-dot/track visibility. Capture Settings and actual task-card evidence; inspect the animations over time, because still screenshots cannot prove correct motion.
- All seven existing choices and persisted configuration keep working; Orbital pixel remains the default. No runtime dependencies added.

## Screenshots

![Screenshot-2026-10-15-at-17.03.10](/api/tasks/0798/attachments/screenshot-1.png)
![Screenshot-2026-10-15-at-11.40.44](/api/tasks/0798/attachments/screenshot-2.png)

## Activity

- 2026-10-15T10:08:29Z · created · njachowski@gmail.com
- 2026-10-15T10:08:33Z · screenshots
- 2026-10-15T10:19:23Z · status inbox→ready
- 2026-10-15T11:01:52Z · status ready→active, branch
- 2026-10-15T11:08:40Z · message_queued at 2026-10-15T11:08:40.018Z
