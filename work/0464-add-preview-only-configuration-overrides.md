---
id: "0464"
title: Add preview-only configuration overrides
type: feature
status: active
priority: p1
area: ui
assigned_to: ai
created_by: ""
branch: feat/add-preview-only-configuration-overrides
created_at: "2026-09-20T09:34:23Z"
updated_at: "2026-09-20T11:54:30Z"
dev_error_count: 1
---
## Problem

UI previews and browser-based UI tests sometimes need a deliberately different runtime configuration from the repository’s normal `repoos.toml`. A key example is authentication: RepoOS should keep auth enabled for normal use, while local preview instances may need it disabled to make screenshot and browser-test setup reliable. Today this requires changing the real configuration or adding ad-hoc startup behavior.

## Desired UX

Support a preview-only configuration overlay in `repoos.toml`. Normal RepoOS commands use the base configuration. Preview-specific startup resolves the base configuration plus preview overrides, allowing targeted local behavior without weakening the normal runtime.

Example:

```toml
[auth]
enabled = true

[preview.auth]
enabled = false
```

For preview startup, effective configuration precedence should be: defaults, base `repoos.toml`, `[preview.*]` overlay, then explicit CLI flags. Nested tables must deep-merge, so an override changes only the specified value.

## Acceptance criteria

- [ ] `repoos.toml` supports a documented `[preview]` overlay, including nested sections such as `[preview.auth]`.
- [ ] The overlay is applied only by the preview/UI-test preview path; normal `repoos serve` and other standard commands retain base configuration.
- [ ] Configuration precedence is defaults → base config → preview overlay → explicit CLI flags.
- [ ] Nested preview settings deep-merge with their base counterparts.
- [ ] Preview startup clearly reports when overrides are active, including the effective overridden keys.
- [ ] Provide an escape hatch to run a preview without its overlay (for example, `--no-preview-overrides`).
- [ ] Add focused tests covering base-only behavior, nested merge behavior, CLI precedence, and confirmation that non-preview startup ignores the overlay.
- [ ] Update this RepoOS repository’s `repoos.toml` to set `preview.auth.enabled = false` while keeping its normal `auth.enabled` setting unchanged.
- [ ] When auth is disabled by preview config, preserve safe local-preview defaults (for example, loopback binding unless separately and explicitly overridden).
- [ ] Update the user documentation with an explanation of preview-only overrides, their scope and precedence, supported commands, and a copyable auth example. Clearly document that they are for local preview/UI-test processes and do not alter normal or production-like startup.

## Notes for AI

Keep the override scope intentionally narrow: it is an isolated preview-runtime feature, not a general environment/profile system. Reuse the existing configuration parsing and server/preview launch paths where possible; avoid duplicating configuration schemas. Keep developer/config references in sync with the user-facing documentation.

## Activity

- 2026-09-20T09:34:23Z · created · unknown
- 2026-09-20T09:35:45Z · body
- 2026-09-20T09:36:44Z · status inbox→ready
- 2026-09-20T09:39:04Z · body
- 2026-09-20T11:48:33Z · status ready→active, branch
- 2026-09-20T11:51:08Z · agent exited with an error (opencode) · error: Unexpected server error. Check server logs for details.
- 2026-09-20T11:54:30Z · needs_input
