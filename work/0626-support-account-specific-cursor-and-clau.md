---
id: "0626"
title: Support account-specific Cursor and Claude Code usage sources
type: feature
status: draft
priority: p3
area: [agent, server]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-02T08:51:54Z"
updated_at: "2026-10-02T08:52:05Z"
---
Investigate and implement conditional live usage for the Cursor and Claude Code rows on Agents > Model providers. Cursor team administrators can use the documented Admin API for team usage and spend; individual subscriptions need an explicitly supported source before enabling live data. Claude Code organization admins can use the Claude Code Analytics Admin API or Claude Enterprise Analytics API as appropriate; individual Pro or Max subscription quota has no verified public API. Detect or configure account type, request only the needed credentials, distinguish usage and spend from remaining subscription quota, and keep clear dashboard fallback when unsupported. Document scopes, freshness, and limitations, with route and UI coverage. Sources: https://docs.cursor.com/en/account/teams/admin-api ; https://platform.claude.com/docs/en/manage-claude/claude-code-analytics-api ; https://platform.claude.com/docs/en/manage-claude/analytics-api

## Activity

- 2026-10-02T08:51:54Z · created · unknown
- 2026-10-02T08:52:05Z · status inbox→draft
