---
id: "0015"
title: Add draft status for proposed (pre-backlog) tasks
type: feature
status: inbox
priority: p2
area: core
assigned_to: ai
created_by: nick
branch: feat/0012-draft-status
created_at: 2026-06-02T18:16:51Z
updated_at: 2026-06-02T18:16:51Z
---
## Activity

- 2026-06-02T18:16:51Z · created · unknown

## Problem

There's no holding pen for *proposed* work. Today the floor of the lifecycle is
`inbox` ("captured, not yet triaged"), which implicitly assumes a human captured
it. The motivating case: a daily agent that proposes recommended tasks. Those
shouldn't land in `inbox` (the real backlog) unreviewed — they need a pre-backlog
state, and a human's move out of it is the moment of "yes, this is real."

A `draft` status provides that boundary: proposed but not yet accepted. The
human's promotion of `draft → inbox` is the explicit curation gesture.

## Desired outcome

A new lifecycle floor:

    draft → inbox → ready → active → review → done

- `draft` = proposed, not yet accepted into the backlog. Agent recommendations
  land here; half-formed human ideas can too.
- `inbox` onward = unchanged.

Drafts are SEGREGATED from the default board/list so a recommender agent can't
bury the real backlog. Promotion out of draft is a human act.

## Important: status is lifecycle, NOT provenance

Do not encode "who proposed this" in the status. `draft` is a *lifecycle
position* (not-yet-accepted), not "made by an agent." Provenance lives in the
existing `created_by` field (e.g. `agent:daily-recommender` vs `nick`). The two
are independent axes:

- agent proposal → `status: draft` + `created_by: agent:...`
- human's half-baked idea → `status: draft` + `created_by: nick`
- accepted agent proposal → `status: inbox` + `created_by: agent:...` (still
  agent-provenance, now accepted)

Keep them separate so "show me agent-proposed drafts" is a `created_by` filter,
not a status hack.

## Acceptance criteria

- [ ] `draft` added to the STATUSES enum as the lifecycle floor (before `inbox`)
- [ ] EVERY status-aware surface handles it: the STATUSES constant, status sort
      rank, CLI `mv` validation, UI board columns + status color map, counts,
      and default `ros list` filtering. Missing one leaves it half-wired (e.g.
      `mv` rejects `draft`, or the UI has no column for it).
- [ ] Drafts are EXCLUDED from the default board and default `ros list` — shown
      only via an explicit view ("Proposed"/"Drafts") or `ros list draft`. If
      drafts render inline as just another column by default, the feature has
      failed its purpose (the point is to keep noise out of the backlog).
- [ ] `draft → inbox` promotion is the human curation gate. Agents may CREATE
      drafts; promoting them is a human act. Reflect in AGENTS.md (and, once
      orchestration lands, in agent permissions). A recommender agent must not
      self-promote.
- [ ] BACK-COMPAT: tasks with no explicit `status` still default to `inbox`, NOT
      `draft`. This change must not reclassify existing work as draft. The
      default-when-absent stays `inbox`; only explicitly-`draft` tasks are drafts.
- [ ] `ros new` and `config.defaultStatus` stay `inbox` — `draft` is set
      explicitly (by agents/recommenders, or by a human choosing it).
- [ ] `draft` has a distinct, MUTED visual treatment (lower weight than inbox —
      it's pre-backlog).
- [ ] Round-trip/parsing unaffected for draft-status tasks.

## Notes for AI

- This is a STATUS-ENUM change, and statuses are referenced in many places.
  Enumerate and update ALL of them before considering it done — the constant,
  the sort rank, CLI `mv` validation, UI columns, UI status color map, counts,
  default list filtering. The test suite (task 0001) should assert the invariant
  "every status is handled on every surface"; this task is a good reason that
  invariant matters.
- Do NOT overload status with provenance (see the section above). `draft` is
  lifecycle; `created_by` is provenance. Independent axes.
- Segregation is the whole point — drafts must not bury the real backlog. If you
  find yourself adding `draft` as just another always-visible column, stop:
  default views exclude it, an explicit view surfaces it.
- Promotion gate is a real boundary, not a suggestion — agents create drafts,
  humans accept them. Don't build a path for an agent to move draft→inbox.
- Back-compat is a hard requirement: the absent-status default stays `inbox`.
  Verify existing `work/*.md` files are unaffected after the change
  (`bun run build`, then parse them all).
- Frontmatter uses `created_at` (UTC/Z) per current format — match 0007.

## Scope

- v1: add `draft`, wire every status surface, segregate from default views,
  human-only promotion, back-compat default-to-inbox.
- Defer (note intent, don't build): the daily-recommender agent itself; a bulk
  draft review/triage UI; auto-expiry of stale drafts.

## Related

- Enables a future "daily recommender agent" task — agent proposes drafts, human
  promotes. Queue that separately once `draft` exists.
- Lifecycle (status) and provenance (`created_by`) are independent axes.
- Status-enum change; pairs with the every-status-handled invariant in the test
  suite (0001).
