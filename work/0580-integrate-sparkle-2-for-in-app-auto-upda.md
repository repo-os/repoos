---
id: "0580"
title: Integrate Sparkle 2 for in-app auto-update in RepoOS Hub
type: feature
status: inbox
priority: p1
area: macos
assigned_to: ""
created_by: ""
branch: ""
created_at: "2026-09-28T18:44:08Z"
updated_at: "2026-09-28T18:44:08Z"
---
Add Sparkle 2 to RepoOS Hub so users receive in-app update prompts automatically when a new version is released, without needing to re-download from GitHub or re-run Homebrew.

## What to do

### Add Sparkle to the Xcode project
1. Add Sparkle 2 as a Swift Package dependency: `https://github.com/sparkle-project/Sparkle`, version `~> 2.0`.
2. Add the `Sparkle` framework to the Hub target's "Frameworks, Libraries, and Embedded Content" — embed and sign it.
3. Add the required Info.plist keys:
   - `SUFeedURL` — the URL where `appcast.xml` will be served (e.g. `https://github.com/repo-os/repoos/releases/latest/download/appcast.xml` or a dedicated CDN path)
   - `SUPublicEDKey` — the EdDSA public key for update signature verification (generated in the next step)
4. Instantiate `SPUStandardUpdaterController` in `AppDelegate` (or `@main` struct) and wire a **Check for Updates** menu item under the app menu.

### Generate EdDSA signing keys
1. Run `generate_keys` from the Sparkle distribution to create a key pair.
2. Store the **private key** in the CI secrets as `SPARKLE_PRIVATE_KEY` (used by `generate_appcast` in the release pipeline — see #0580 for the CI step).
3. Embed the **public key** in `Info.plist` as `SUPublicEDKey`.
4. Document the key rotation procedure in `docs/macos-hub-release.md`.

### Update privacy / entitlements
- Sparkle requires network client access — this should already be covered by #0577's `com.apple.security.network.client` entitlement.

### Test locally
- Build and run the app. The **Check for Updates** menu item should appear under the app menu.
- Point `SUFeedURL` temporarily at a local test appcast to verify the update flow before the release CI (task #0580) generates the real one.

## Dependencies

- Requires #0577 (entitlements) and #0578 (signing) to be in place.
- The CI appcast generation step is a separate task (#0580) that consumes the `SPARKLE_PRIVATE_KEY` secret created here.

## Notes

- Sparkle 2 uses EdDSA (Ed25519) signatures, not DSA. Do not follow older Sparkle 1 guides that reference DSA keys or `sparkle:dsaSignature`.
- `SUFeedURL` must be HTTPS. If appcast hosting changes later, it can be updated in Info.plist without a key rotation.
- The standard Sparkle update UI (alert dialog) is acceptable for v1; custom update UI is a follow-on.
- Sparkle's sandboxing support: if the Hub is ever moved into the App Store sandbox, additional XPC service setup is required — not needed now.

## Activity

- 2026-09-28T18:44:08Z · created · unknown
