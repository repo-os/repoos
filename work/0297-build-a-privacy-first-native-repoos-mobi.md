---
id: "0297"
title: Build a privacy-first native RepoOS mobile hub
type: feature
status: ready
priority: p2
area: mobile
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-26T10:53:07Z"
updated_at: "2026-08-26T11:02:13Z"
---
## Problem

RepoOS is usable on mobile as a PWA, but browsers do not consistently surface installation and retain visible browser chrome before installation. Users who run multiple private, self-hosted RepoOS instances need a fast, app-like way to switch between them without the mobile app discovering, indexing, or otherwise learning about their servers.

## Desired UX

Ship an iOS and Android native shell that is a private client, not a directory or hosted service. On first launch, the user enters a RepoOS server URL. The app validates that it is HTTPS and reachable, then lets the user name and save it locally. A saved-server picker makes switching between instances such as dev.repoos.org and celleris.repoos.org fast. The selected instance loads the existing responsive RepoOS web UI in a WebView, without browser tabs or an address/search bar.

The server list, display names, and selection state remain on-device only. The native app must not perform server discovery, report the list, or require a central RepoOS account. Each server owns its own authentication; its normal web session persists across app launches like a browser session. Optionally, the user can enable biometric or device-passcode protection before reopening the app or a selected server.

## Scope / guardrails

- Build with Capacitor unless an implementation spike demonstrates a better fit.
- Keep the RepoOS web app as the primary UI; do not duplicate its screens natively.
- Treat every joined server as an untrusted origin: require HTTPS, isolate per-origin session/storage, and do not expose privileged native plugins to arbitrary web content.
- Make add, rename, reorder, select, and remove server entries explicit local actions.
- Support normal server auth in the WebView and test the RepoOS native email-OTP flow; document any Cloudflare Access or WebView authentication limitations found.
- The app is useful offline only for its local server picker and lock screen. It must clearly show a server is unreachable rather than pretending the RepoOS UI works offline.

## Acceptance criteria

- [ ] iOS and Android builds launch to a native server picker with no preconfigured server or central discovery.
- [ ] A user can add an HTTPS RepoOS URL, assign a local display name, and save it only on the device.
- [ ] A user can switch, edit, reorder, and delete saved instances.
- [ ] Selecting an instance opens its existing RepoOS UI in an in-app WebView without browser chrome.
- [ ] A server-authenticated session survives app relaunch when the server session is valid.
- [ ] Optional biometric/device lock can protect reopening the app or a selected instance without replacing server authentication.
- [ ] Arbitrary joined servers cannot call privileged native APIs merely because they are loaded inside the app.
- [ ] The implementation documents WebView compatibility results for RepoOS auth and the chosen Capacitor/Ionic architecture.

## Activity

- 2026-08-26T10:53:07Z · created · unknown
- 2026-08-26T11:02:13Z · status inbox→ready
