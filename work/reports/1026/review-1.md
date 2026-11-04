---
task: 1026
pass: 1
at: "2026-11-04T22:37:12.503Z"
agent: reviewer
cli: cursor
model: grok-4.7-low
branch: feat/easter-eggs-bundle-init-template-paths-s
state: ok
tree_identity: "b1482068b:db80f918c"
---
## Verdict
needs some work — the bind banner mislabels the interface, and an empty human schedule template is still flagged.

## Relevance
still relevant — none of the seven items is already fixed on main.

## Evidence
None

## Bugs
**Bind-banner label ignores the resolved host (class: bind reason inferred from a hardcoded address).** `cmdServe` in `src/commands/serve.ts` already has `tailscaleDetected` from `resolveServeHost`, but the Bind row does not use it. `host === "0.0.0.0"` always says "Tailscale detected", including an explicit `--host 0.0.0.0` where `tailscaleDetected` is false. Every other host, including a custom address, is printed as `127.0.0.1 (localhost only)`. The later Tailnet row correctly checks `tailscaleDetected`. Banner tests only pass pre-built strings into `renderServeBanner`, so they never execute this ternary.

**Empty-body warning skips the human exemption (class: assignee exemption bypassed by an early return).** `scheduleTemplateWarning` in `src/core/schedule.ts` returns missing-section text when `body` is empty before it calls `assessTaskUnderspecified`, so a human assignee is still warned. `enrichSchedule` calls `assessTaskUnderspecified` directly and correctly leaves human templates unflagged, so the card badge and the CLI warning disagree on an empty human template. The non-empty human path in the same helper is fine. `printScheduleTemplateWarning` in `src/commands/schedule.ts` is the only caller of the helper.

**Native `title` tooltip (class: native title on new UI).** `ScheduledTasksPanel.vue` puts the missing-section list only on `:title` of the "Template incomplete" badge. That attribute does not meet the styled, keyboard- and touch-usable tooltip rule, and it is the only place the card shows which sections are missing. No other new `title` in this diff.

## Edge cases
`gitIdentityConfigured` requires both `GIT_AUTHOR_*` and `GIT_COMMITTER_*`. Git will commit with only the author pair. The zero-commit `commitNewFile` path was not changed; it already inherits the process environment.

## Suggestions
The handoff capture `default-1.png` (`auto: matched src/ui-app/**`, route `/`) is Mission Control still on its skeleton, not the Scheduled Tasks badge. The badge is covered by the panel unit test. No new bare `node`, `npm`, or `npx` invocations.

## Automated verification

- Browser console-error check (handoff evidence): **passed** — No blocking browser console errors in handoff evidence (2026-11-04T22:34:36.802Z).
- Guard negative-test evidence: **skipped** — no check guard rules were materially changed on this branch.

