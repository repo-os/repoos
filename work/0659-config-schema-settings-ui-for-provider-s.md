---
id: "0659"
title: Config schema + Settings UI for provider selection
type: feature
status: inbox
priority: p1
area: ui
story: Cloud attachment storage
depends_on: ["0658"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:28:51Z"
updated_at: "2026-10-05T09:15:58Z"
---
Slice 2 of provider selection: add the config schema (repoos.toml) for choosing a provider (local as default; cloud unavailable-but-explained until configured). Every user-facing setting needs a matching Settings UI control. Scope: getConfigSchema addition, Settings tab control, and explanation state when cloud is not configured.

Depends on #0658 (config key definition / schema shape). Local provider is always available; cloud provider shows an unavailable-but-explained message until configured.

## Activity

- 2026-10-05T08:28:51Z · created · unknown
- 2026-10-05T09:15:58Z · body
