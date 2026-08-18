---
id: "0010"
title: Activity log and updated_at timestamps in task files
type: feature
status: done
priority: p2
area: core
assigned_to: ai
created_by: nick
branch: "0010-activity-log"
created_at: "2026-06-02T00:00:00Z"
updated_at: "2026-06-02T17:48:10Z"
---
## Problem

A task file has no memory of its own evolution, and no reliable "when was this
last touched" signal. Two related gaps:

1. No timeline. A task shows current spec and status but not how it got there —
   what was tried, when it moved, what was decided. This is the gbrain
   compiled-truth (the spec) + timeline (the evidence trail) split, missing its
   timeline half.
2. No queryable freshness. There's no dependable field to sort/filter by "last
   changed" — needed for "what's active today," "what's gone stale," "most
   recently touched first."

These are two sides of one thing: the narrative belongs in the body (the log),
the queryable projection belongs in frontmatter (`updated_at`). Same change,
written together.

## Desired outcome

- An append-only **Activity** section at the end of the body. Status changes
  auto-append a line; humans/agents can append `note` lines. Entries are never
  rewritten or reordered.
- A reliable **`updated_at`** frontmatter field carrying the timestamp of the
  most recent CONTENT change — the queryable projection of "the log's latest
  entry."
- Both use full **ISO-8601 timestamps in UTC, to the second, with the `Z`
  suffix** (e.g. `2026-06-01T09:42:30Z`). Velocity is expected to be high —
  multiple status flips per hour across parallel agents — so date-only
  granularity would collapse distinct events into ambiguous ordering. UTC (not
  a local offset) keeps every timestamp in one canonical zone, so they sort
  lexically and never vary by which machine an agent ran on.

Example log shape (illustrative):

    ## Activity

    - 2026-06-01T09:14:02Z · created · nick
    - 2026-06-01T09:14:48Z · status inbox→ready · nick
    - 2026-06-02T11:03:20Z · status ready→active · agent:opencode-α
    - 2026-06-02T11:07:55Z · note · blocked on #0020; parking until merged

## Acceptance criteria

- [ ] Activity section recognized at end of body; created if absent
- [ ] Status changes auto-append a timestamped line (ISO-8601, seconds, UTC `Z`)
- [ ] Existing log entries only ever APPENDED — never rewritten/reordered/deduped
- [ ] `updated_at` set to a full ISO-8601 UTC timestamp on every content
      mutation (field edit, body edit, status change)
- [ ] `updated_at` does NOT change on a reindex / file re-read — only on an
      actual content change
- [ ] The log line and `updated_at` are written ATOMICALLY in one operation, so
      they cannot drift out of sync
- [ ] Tasks lacking an Activity section / `updated_at` still parse (back-compat)
- [ ] Round-trips cleanly: parse → serialize → parse preserves log + field
- [ ] Migration: decide and document whether to backfill a synthetic `created`
      log line + `updated_at` into existing tasks, or start fresh from next
      mutation
- [ ] Decide the field name: keep existing `created`/`updated`, or rename to
      `created_at`/`updated_at` for the `_at` convention (a frontmatter KEY
      change — if renaming, migrate existing files in the same change). Do NOT
      end up with both `updated` and `updated_at`.

## Notes for AI

FORMAT-SENSITIVE and SELF-MODIFYING — read the self-hosting section of
/AGENTS.md and ADR-0003 before starting. Specifics:

- Implement a SINGLE internal "record change" helper that appends the log line
  AND stamps `updated_at` together. Every mutation path (facade `updateStatus`/
  `updateTask`, the server's safe-write) must go through it. This is the only
  way the log and the field cannot drift — do not set them in two places.
- The reindex subtlety: the watcher re-reads files on change, and the server
  re-parses on startup. Neither is a mutation. `updated_at` and the log must
  move ONLY when content actually changes, never on a re-read/reindex, or the
  field becomes meaningless noise. The safe-write layer is the correct
  chokepoint — set it there, not in the parser or indexer.
- The log is body text, not frontmatter — do NOT parse it into structured
  fields. Frontmatter stays the query layer; the log is narrative/evidence.
  `updated_at` is the one bridge between them, and it's a field, not derived
  from parsing the log.
- Append-only is a hard invariant (mirrors ADR immutability): the serializer
  must not disturb existing log lines when rewriting frontmatter above them.
- Store timestamps in UTC with the `Z` suffix (e.g. `2026-06-01T09:42:30Z`),
  ISO-8601, to the second. UTC keeps one canonical zone so the log sorts
  lexically and never varies by which machine an agent ran on. Do NOT store
  local-offset (`+08:00`) or tz-naive timestamps. Local-time display, if ever
  wanted, is the UI's job at render time — storage is always UTC.
- After implementing: `bun run build`, then run the parser against EVERY file in
  this repo's `work/` and confirm none are mangled. Ship the migration in the
  same change.
- Scope v1 to status-change auto-logging + manual `note` appends + `updated_at`.
  Defer auto-logging of field edits, branch creation, and agent actions to a
  follow-up — note the intent, don't build it.

## Related

- Pattern source: gbrain's compiled-truth + timeline page model, and its rule
  that queryable data lives in frontmatter while narrative lives in the body.
- Append-only discipline parallels ADR-0001/0002 and the ADR immutability
  convention.

## Activity

- 2026-06-02T00:00:00Z · created · (migrated)
- 2026-06-02T17:48:10Z · status review→done
