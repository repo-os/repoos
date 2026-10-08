---
id: "0580"
title: Integrate Sparkle 2 for in-app auto-update in RepoOS Hub
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Acceptance criteria, Notes for AI"
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:44:08Z"
updated_at: "2026-10-05T22:38:16Z"
---
Add Sparkle 2 to RepoOS Hub so users receive in-app update prompts automatically when a new version is released, without needing to re-download from GitHub or re-run Homebrew.

## What to do

### Add Sparkle to the Xcode project
1. Add Sparkle 2 as a Swift Package dependency: `https://github.com/sparkle-project/Sparkle`, version `~> 2.0`.
2. Add the `Sparkle` framework to the Hub target's "Frameworks, Libraries, and Embedded Content" — embed and sign it.
3. Add the required Info.plist keys:
- `SUFeedURL` — the URL where `appcast.xml` will be served (e.g. `https://github.com/repo-os/repoos/releases/latest/download/appcast.xml` or a dedicated CDN path — decide on hosting before wiring this in)
- `SUPublicEDKey` — the EdDSA public key for update signature verification (generated below)
4. Instantiate `SPUStandardUpdaterController` in `AppDelegate` (or `@main` struct) and wire a **Check for Updates** menu item under the app menu.

### Generate EdDSA signing keys
1. Run `generate_keys` from the Sparkle distribution to create a key pair.
2. Store the **private key** in the CI secrets as `SPARKLE_PRIVATE_KEY` (used by `generate_appcast` in the release pipeline — see next section).
3. Embed the **public key** in `Info.plist` as `SUPublicEDKey`.
4. Document the key rotation procedure in `docs/macos-hub-release.md`.

### Wire appcast generation into the release CI
In `.github/workflows/macos-hub.yml`, after notarization and stapling (#0579):
1. Run `generate_appcast` (bundled with Sparkle) pointing at the stapled DMG and the `SPARKLE_PRIVATE_KEY` secret to produce a signed `appcast.xml`.
2. Upload `appcast.xml` as a release asset alongside `RepoOSHub.dmg`.
3. Confirm `SUFeedURL` in Info.plist points to the same GitHub Release asset URL pattern (or update it if hosting elsewhere).

### Update privacy / entitlements
- Sparkle requires network client access — covered by #0577's `com.apple.security.network.client` entitlement.

### Test locally
- Build and run the app. The **Check for Updates** menu item should appear under the app menu.
- Point `SUFeedURL` temporarily at a local test appcast to verify the update flow before the first real release.

## Dependencies

- Requires #0577 (entitlements), #0578 (signing), and #0579 (notarization) to be in place before the release CI step can produce a valid signed appcast.

## Notes

- Sparkle 2 uses EdDSA (Ed25519) signatures, not DSA. Do not follow older Sparkle 1 guides that reference DSA keys or `sparkle:dsaSignature`.
- `SUFeedURL` must be HTTPS.
- The standard Sparkle update UI (alert dialog) is acceptable for v1; custom update UI is a follow-on.
- Sparkle's sandboxing support: if the Hub is ever moved into the App Store sandbox, additional XPC service setup is required — not needed now.

## Activity

- 2026-09-28T18:44:08Z · created · unknown
- 2026-09-28T18:44:35Z · body
- 2026-09-28T18:45:05Z · story
- 2026-10-05T11:15:28Z · needs_input
