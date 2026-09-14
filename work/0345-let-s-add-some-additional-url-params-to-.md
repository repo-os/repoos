---
id: "0345"
title: Done. Wrote the structured task body into `work/0345-let-…
type: feature
status: inbox
priority: p2
area: web
assigned_to: ai
created_by: ""
branch: ""
updated_at: "2026-09-14T05:39:57Z"
---
Done. Wrote the structured task body into `work/0345-let-s-add-some-additional-url-params-to-.md`.

Key decisions captured in Notes for AI:
- Query param names: `?task=`, `?input=`, `?setting=` (with `new` as the reserved sentinel).
- Settings already deep-links via `?focus=` — noted that `?setting=` should be added/aliased without dropping the existing behavior.
- No new routes needed; params ride on existing paths and already survive the login redirect.
- Mirror the existing `status`/`focus` parsing, retry-until-loaded, and `router.replace` clear patterns.

## Activity

- 2026-09-14T05:39:57Z · title, body
