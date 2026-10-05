---
id: "0577"
title: Enable hardened runtime and configure entitlements for RepoOS Hub
type: feature
status: inbox
needs_input: true
needs_input_reason: underspecified
needs_input_detail: "missing sections: Problem, Desired UX, Acceptance criteria, Notes for AI"
priority: p1
area: macos
story: MacOS Native App
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-09-28T18:43:15Z"
updated_at: "2026-10-05T11:15:28Z"
---
Notarization requires the app to opt into Apple's hardened runtime. Configure the Xcode project and add an entitlements file that accurately declares what the app uses.

## What to do

1. In the RepoOS Hub Xcode target (Release configuration), enable **Hardened Runtime** (`ENABLE_HARDENED_RUNTIME = YES`).
2. Create `macos/RepoOSHub/RepoOSHub.entitlements` with the entitlements the app actually uses:
   - `com.apple.security.network.client` — WKWebView makes outbound HTTPS requests to RepoOS servers
   - `com.apple.security.cs.allow-jit` — only if any WebView content runs JIT-compiled JavaScript (evaluate whether this is needed; WKWebView's in-process JavaScript typically does not require this, but test)
   - Do NOT add entitlements the app does not use — Apple rejects unnecessarily broad entitlements
3. Wire the entitlements file into the Xcode build settings (`CODE_SIGN_ENTITLEMENTS`).
4. Build locally in Release mode and confirm no entitlement errors.
5. Run `repoos check` to verify the build still passes.

## Dependencies

- Depends on #0576 (secrets) being provisioned before CI can test signing end-to-end, but local entitlement validation can be done independently.

## Notes

- The hardened runtime restricts certain APIs by default. If a WKWebView feature breaks after enabling it, check Apple's entitlement list for the relevant exception (e.g. `com.apple.security.cs.disable-library-validation` is sometimes needed for plugins, but RepoOS Hub should not need it).
- Document the entitlement rationale inline in the `.entitlements` file comments.

## Activity

- 2026-09-28T18:43:15Z · created · unknown
- 2026-09-28T18:44:58Z · story
- 2026-10-05T11:15:28Z · needs_input
