---
id: "0481"
title: Document the macOS RepoOS Hub
type: documentation
status: inbox
priority: p2
area: macos
assigned_to: ai
created_by: ""
branch: ""
pm_cli_override: github copilot
pm_model_override: default
created_at: "2026-09-22T05:30:52Z"
updated_at: "2026-09-22T14:27:25Z"
---
Update the RepoOS Hub documentation and landing-page presentation now that the native macOS product surface and remote capability flow are ready to describe. Treat this as a documentation/publishing task, not a request to invent or change Hub behavior.

## Scope

### 1. External user documentation
Expand or replace `user-docs/macos-hub.md` with a complete, task-oriented guide for:

- What RepoOS Hub is: one native macOS app for managing multiple independent local and remote RepoOS projects/servers.
- Requirements, installation, first launch, updates, and the current distribution/signing/notarization status.
- Adding a server, editing its display name/origin, removing it, pinning servers, switching between servers, and the health/offline states users can expect.
- Pinning tasks across servers, opening a pinned task in the correct server, stale/deleted pins, and the native switcher/keyboard workflow if shipped.
- Notifications and attention: what counts as attention (active agents, review-ready tasks, and needs-input tasks), how badges/notifications are enabled or disabled per server, how local and remote servers differ, polling/freshness limitations, and how to avoid treating a stale/offline summary as current.
- Local loopback access: explain that `localhost`, `127.0.0.1`, and `::1` can use the bounded Hub summary/task-search APIs without a capability token; explain that the server verifies the actual loopback peer and that this exception does not apply to forwarded or remote traffic.
- Remote Hub capability tokens: what `summary:read` and `search:read` authorize, what they do not authorize (no browser session, task mutation, filesystem access, or arbitrary API access), expiry/audience/origin binding, how to pair a server from the signed-in RepoOS web UI, and how to rotate/revoke a capability.
- Safe handling: the plaintext token is shown once, is stored in the macOS Keychain, must never be pasted into tasks/logs/URLs/browser storage or shared, and should be revoked/rotated after loss or suspected exposure. Include the expected behavior for expired/revoked tokens and exact-origin mismatches.
- Per-server sign-in/session isolation, clear sign-in, HTTPS expectations for remote servers, WebKit/SSO limitations, and troubleshooting for health checks, TLS, offline servers, blocked redirects, and stale pins.

Link to the relevant capability and security material without exposing implementation-only detail unnecessarily. Keep examples copyable and ensure all claims match the shipped implementation and `docs/native-hub-capabilities.md`, `docs/native-hub-webkit.md`, and ADR 0006.

### 2. Internal project documentation
Update the appropriate `docs/` pages (at minimum the native Hub capability and WebKit/architecture references) so maintainers have:

- A single documented product/version scope and clear v1/v2 boundary.
- The user-visible behavior and terminology used by the external guide.
- The pairing/token lifecycle, scopes, local-loopback exception, exact-origin restriction, Keychain storage rule, expiry, rotation, revocation, and audit/logging redaction requirements.
- A checklist for keeping docs, server endpoints, native Hub behavior, and release notes in sync when the protocol changes.

If the implementation differs from the existing ADR or docs, document the shipped behavior accurately and flag any genuine contract mismatch instead of silently papering it over.

### 3. RepoOS landing page / project presentation
Update the repository landing-page surface used by prospective users (README and/or the existing project/website landing content) with a concise Hub announcement and link to the full guide. Cover the multi-server macOS workflow, pinned tasks, attention/notifications, local loopback convenience, and the secure pairing model for remote servers. Include download/platform requirements only when they are current. Do not duplicate the full security guide on the landing page.

### 4. Visuals
Add screenshots or product visuals only if the native UI is stable and an approved asset already exists. Otherwise leave a clearly scoped follow-up rather than committing placeholder or unstable imagery. Do not check in screenshots under `work/` or `inputs/`.

## Deliverables

- Updated external Hub guide with working internal links and accurate setup/troubleshooting instructions.
- Updated internal architecture/capability documentation, with no contradiction between ADR, protocol docs, and user-facing claims.
- Updated landing page/README callout linking to the guide.
- Release-note/changelog entry only if this repository’s established landing/release workflow requires it; do not fabricate a release version or download URL.
- Documentation-only changes must not alter Hub code, token scopes, auth behavior, or server APIs.

## Acceptance criteria

- A new macOS user can install/add a local server and understand server management, pins, task switching, attention, and notifications without reading source code.
- A user can distinguish local loopback no-token access from remote capability-token pairing and knows exactly what each capability permits.
- The remote-token instructions explicitly cover one-time display, Keychain storage, exact-origin binding, expiry, rotation, revocation, and exposure response; no example leaks a real token.
- Documentation states the security boundaries and known WebKit/SSO/offline limitations without implying that the Hub shares browser cookies or grants write access.
- All links resolve, code samples and endpoint names match the shipped implementation, and docs do not claim screenshots/features that are not stable or released.
- Run the repository’s documentation/link/format checks applicable to the changed files and report any unavailable visual asset or release metadata as a concrete follow-up.

## Activity

- 2026-09-22T05:30:52Z · created · unknown
- 2026-09-22T14:23:59Z · pm_cli_override, pm_model_override
- 2026-09-22T14:24:02Z · pm_cli_override
- 2026-09-22T14:24:05Z · pm_cli_override
- 2026-09-22T14:27:25Z · body
