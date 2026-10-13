---
id: "0661"
title: Stable reference format + resolver
type: feature
status: ready
priority: p1
area: core
story: Cloud attachment storage
depends_on: ["0658"]
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-10-05T08:29:04Z"
updated_at: "2026-10-13T18:21:30Z"
---
Slice 4 (part of 'Cloud attachment storage' story): define a stable, opaque reference format used in Markdown for attachments, plus a resolver that maps that reference back to the actual storage resource at serve time. The reference must contain no secrets or expiring URLs, survive storage-mode switches (local/file/cloud), repo renames, and moving to another machine. Resolver runs server-side at serve/render time.

Open design choices (see questions): token format, Markdown syntax, resolver storage (sidecar index vs embedded mapping).

## Design decision
Reference format design, resolved. Token format follows the human's steer (a plain UUID per image); Markdown syntax and resolver storage use the recommended defaults.

- **Token:** a random opaque id per attachment, `att_<uuid>`, plus the content-type suffix for convenience (`att_<uuid>.png`). Not a content hash (re-encoding the bytes would change the id) and not metadata-derived (a storage reorganisation would change it).
- **Markdown syntax:** keep today's embedded image link and put the opaque token where the old path was — `![<original name>](/api/tasks/<task>/attachments/att_<uuid>.<ext>)`. Not a custom `[[att:<uuid>]]` tag: the link stays valid CommonMark (renders in RepoOS and any Markdown viewer), the existing renderer already understands `![]()` image links, and the delta from the current URL is minimal.
- **Resolver storage:** no sidecar index and no storage coordinates in the reference. The token *is* the storage-provider object name, so the resolver is `provider.get(<task>, "att_<uuid>.<ext>")` through the #0658 interface. The provider — not the Markdown — owns where bytes physically live, so a local↔cloud mode switch, a repo rename or a move to another machine leaves every reference unchanged. Original filename is carried as the Markdown alt text; MIME comes from the token suffix. A sidecar manifest is only warranted if a later slice needs metadata the object cannot carry (size, upload state); nothing in this task does.

The reference therefore contains no secrets, no expiring URLs and no storage path, satisfying the «survive mode switch / rename / move» requirement by construction. The live per-request authorization check is slice 5 (#0662) and is deliberately not part of the reference.


## Activity

- 2026-10-05T08:29:04Z · created · unknown
- 2026-10-05T09:16:12Z · needs_input, questions, body
- 2026-10-05T09:27:48Z · status inbox→ready
- 2026-10-13T18:21:30Z · needs_input, body: section Design decision
