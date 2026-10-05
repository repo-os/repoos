---
id: "0661"
title: Stable reference format + resolver
type: feature
status: ready
needs_input: true
questions: ["Reference format design: UUID-style opaque token (ref:att-...) vs hash-derived vs metadata-based? Markdown syntax: dedicated tag [att:ref] vs embedded link? Resolver storage: sidecar .repoos/attachment-index.json vs embedded mapping file? Confirm before engineering."]
priority: p1
area: core
story: Cloud attachment storage
depends_on: ["0658"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:04Z"
updated_at: "2026-10-05T09:27:48Z"
---
Slice 4 (part of 'Cloud attachment storage' story): define a stable, opaque reference format used in Markdown for attachments, plus a resolver that maps that reference back to the actual storage resource at serve time. The reference must contain no secrets or expiring URLs, survive storage-mode switches (local/file/cloud), repo renames, and moving to another machine. Resolver runs server-side at serve/render time.

Open design choices (see questions): token format, Markdown syntax, resolver storage (sidecar index vs embedded mapping).

## Activity

- 2026-10-05T08:29:04Z · created · unknown
- 2026-10-05T09:16:12Z · needs_input, questions, body
- 2026-10-05T09:27:48Z · status inbox→ready
