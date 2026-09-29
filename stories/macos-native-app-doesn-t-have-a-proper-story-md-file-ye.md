---
number: "0006"
name: MacOS Native App
created_at: "2026-09-27T23:46:57.637Z"
created_by: hello@repoos.org
---
# MacOS Native App

Deliver a production-quality **native macOS RepoOS Hub** — a privacy-first, Homebrew-distributed desktop client for managing self-hosted RepoOS servers. The Hub is a native Swift/WKWebView shell that embeds the RepoOS web UI per-server origin rather than reimplementing the board in AppKit. Users maintain a local server registry; each server remains the source of truth for tasks, agents, and settings.

## Background

ADR 0006 established the architectural contract: **native shell + isolated WKWebView per server origin**, local registry with no credential brokering, and health-checked HTTPS origins. The scaffold (#0470), architecture spec (#0469), server registry (#0471), WebView isolation (#0472), auth tokens (#0474), and navigation recents (#0473) are done. The app ships via a signed DMG on GitHub Releases and a Homebrew tap, with a branded drag-to-install layout. Light/dark mode (#0482), dock-icon transparency (#0495), and navigation state retention (#0473) are all shipped.

The next chapter is **official Apple Developer Program distribution**: Developer ID signing, notarization, and in-app auto-update via Sparkle — removing the Gatekeeper warning and making upgrades frictionless.

## Outcomes

When this story is complete, a user can:

1. **Install without a Gatekeeper warning** — the DMG and app bundle are Developer ID–signed and notarized.
2. **Upgrade in-app** — Sparkle checks for new releases automatically; a one-click prompt downloads and installs the update without re-visiting Homebrew or GitHub.
3. **Trust the CI release pipeline** — signing, notarization, stapling, and appcast generation are automated; no manual Keychain steps per release.
4. **Reach the app from anywhere** — Homebrew tap and GitHub Releases remain the distribution channels, now with a notarized artifact.

## Linked delivery slices

| Task | Focus |
|------|-------|
| **0470** | Scaffold Swift/WKWebView shell, Xcode project, bundle identifiers |
| **0469** | Architecture spec and ADR for native hub |
| **0471** | Server registry: add/remove/reorder HTTPS origins, persisted on-device |
| **0472** | WKWebView isolation: per-origin cookie/storage partitioning |
| **0474** | Revocable hub-capability tokens for server authentication |
| **0473** | Navigation recents and state retention across server switches |
| **0482** | Light/dark mode following system preference |
| **0484** | Cap inactive WebView memory residency |
| **0495** | Transparent dock icon corners |
| **0488** | Rename native clients to RepoOS Hub |
| **0487** | Fix DMG bundle name mismatch in release workflow |
| **0489** | Repair release and Homebrew publishing after rename |
| **0491** | Document the release runbook |
| **0481** | Document the Hub architecture for contributors |
| **0508** | Settings button in the new release panel |
| **0518** | Misc Hub fixes |
| **0494** | Fix `just macos run` after app rename |

**Signing and update pipeline (upcoming):**

| Task | Focus |
|------|-------|
| TBD | Provision Developer ID certificate and store CI secrets |
| TBD | Enable hardened runtime and configure entitlements |
| TBD | Wire Developer ID signing into Xcode build and CI |
| TBD | Wire notarization and stapling into the release workflow |
| TBD | Integrate Sparkle 2 for in-app auto-update |

## Non-goals

- Replacing the RepoOS web UI with a native AppKit reimplementation of Agents, Context, Releases, or Settings.
- Mac App Store distribution (Developer ID + direct download is the chosen channel).
- iOS / Android parity (separate story: #0001).
- Server-side changes driven purely by the native client.

## Principles

- **Origin isolation:** cookies, storage, and in-memory state must not leak across servers.
- **User-supplied origins are untrusted:** the shell must not expose filesystem, arbitrary deep links, or cross-origin privileges to server content.
- **Web UI remains canonical** for complex surfaces; the native shell targets launch, navigation, lifecycle, and OS integration — not a feature fork.
- **CI owns the release:** no manual Keychain or notarization steps per release after initial credential provisioning.

## Success criteria

- A user on a fresh Mac can open the DMG, drag RepoOS Hub to Applications, and launch it without a Gatekeeper warning.
- A user with an older version installed receives an in-app update prompt within 24 hours of a new release and can install it without leaving the app.
- The GitHub Actions release workflow signs, notarizes, staples, packages, and publishes the DMG and appcast automatically on a version tag.
- `docs/macos-hub-release.md` accurately describes the current distribution path (no "Gatekeeper warning is expected" caveat).
