---
id: "0472"
title: Embed selected RepoOS servers in an isolated macOS WebKit container
type: feature
status: active
priority: p1
area: desktop
assigned_to: ai
created_by: ""
branch: feat/embed-selected-repoos-servers-in-an-isol
cli_override: cursor
model_override: composer-2.5
created_at: "2026-09-21T11:50:26Z"
updated_at: "2026-09-21T18:37:16Z"
---
Let the macOS Hub open the selected saved RepoOS server in the main content area while preserving the native shell’s security boundary.

Acceptance criteria:
- Selecting a server loads its standard RepoOS UI in a WKWebView-based content area; switching servers is predictable and restores a usable session where platform behavior permits.
- Web content has no native message handler, injected privileged script, filesystem access, shell access, or Keychain access.
- Navigation policies only allow the intended server flow; unsafe/unexpected origins and downloads have explicit handling.
- External links and OAuth/SSO flows use a documented, safe policy and show useful fallback guidance when embedded authentication cannot work.
- Per-origin authentication/session behavior is documented and tested at the WebKit abstraction boundary where practical.
- Offline, TLS, login, and load failures retain the native sidebar and expose recovery actions.
- Add regression tests/manual verification steps proving arbitrary loaded server JavaScript cannot invoke privileged native capabilities.

Depends on the architecture, project scaffold, and server registry tasks. Do not add an authenticated native API client or status badges in this task.

## Activity

- 2026-09-21T11:50:26Z · created · unknown
- 2026-09-21T11:52:35Z · body
- 2026-09-21T12:07:02Z · status inbox→ready
- 2026-09-21T18:37:11Z · cli_override
- 2026-09-21T18:37:13Z · model_override
- 2026-09-21T18:37:16Z · status ready→active, branch
