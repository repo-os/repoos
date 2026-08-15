---
id: "0201"
title: "Let's add a new agent to \"build your team\"  called the \"D…"
type: feature
status: active
priority: p2
area: general
assigned_to: ai
created_by: ""
branch: feat/let-s-add-a-new-agent-to-build-your-team
created_at: "2026-08-14T15:46:05Z"
updated_at: "2026-08-15T02:44:18Z"
---
Let's add a new agent to "build your team" called the "Debugger Agent". If there's ever a bug you can copy-paste it to him and ask what's up — he diagnoses the root cause and suggests a fix.

He'll be a floating head next to Ross and CTO, and use one of the robot profile pics (assets/*.webp in src/ui-app/public/). Also move Ross and CTO to "build your team" — they are currently in the wrong section of the Agents page.

## Desired change

1. **Debugger Agent in "Build your team"** — add a card in the "Build your team" section of the Agents page (src/ui-app/src/views/AgentsView.vue), following the <BuiltInAgentCard> pattern (src/ui-app/src/components/BuiltInAgentCard.vue) or a chat-style panel.
   - Purpose: paste a bug / error → get a clear diagnosis (root cause + suggested fix).
   - Interactive/conversational first — background-scan behaviour is out of scope unless desired.
2. **Floating head** — add a Debugger head next to Ross/CTO in src/ui-app/src/components/FloatingHeads.vue, gated by its enabled state, opening a bug-paste chat panel (mirror RepoGuideChat.vue). Use a robot-style profile pic.
3. **Move Ross and CTO to "Build your team"** — currently rendered in the Default agents section (driven by DEFAULT_AGENTS in src/core/config.ts). Group Ross/CTO (talk/team agents) with the Debugger under "build your team", distinct from the headless task-engine defaults (engineer, reviewer, pm). Keep DEFAULT_AGENTS seeding and the legacy "RepoOS Guide"→"Ross" migration intact.

## Acceptance criteria

- Debugger card appears in "Build your team" and can be enabled; pasting a bug returns a diagnosis.
- Debugger floating head appears next to Ross/CTO when enabled and opens the bug-paste panel, using a robot profile pic.
- Ross and CTO move from Default agents into "build your team" without breaking their chat panels or config seeding/migration.
- Enabling/disabling an agent toggles its floating head.
- New agent persists (builtInAgents + config) and reloads across tabs/restarts.
- repoos check passes (build, typecheck, tests, headless UI smoke check).
- No new runtime dependency.

## Out of scope

- Background/scheduled scanning for the Debugger (unless wanted).
- Note: pick the robot pic by eyeballing the assets — the session that scoped this could not render images to confirm which file is the robot.

## Activity

- 2026-08-14T15:46:05Z · created · unknown
- 2026-08-15T01:39:25Z · body
- 2026-08-15T01:39:53Z · status draft→inbox
- 2026-08-15T02:44:11Z · status inbox→ready
- 2026-08-15T02:44:18Z · status ready→active, branch
