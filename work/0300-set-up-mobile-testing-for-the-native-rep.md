---
id: "0300"
title: Set up mobile testing for the native RepoOS Hub
type: feature
status: ready
priority: p2
area: mobile
assigned_to: ai
created_by: ""
branch: ""
created_at: "2026-08-26T15:18:19Z"
updated_at: "2026-08-26T15:20:43Z"
---
## Problem

The planned native RepoOS Hub loads user-selected, self-hosted RepoOS servers in a WebView. Browser-only tests cannot validate the most important mobile behavior: native navigation, persistent per-server sessions, biometric gating, WebView origin isolation, and Android/iOS lifecycle behavior.

## Desired UX

Establish a repeatable test strategy and automation harness for the native mobile shell. Developers should get fast feedback for local server-picker behavior, while CI and release candidates validate the real Android/iOS container against controlled RepoOS fixture servers.

## Scope

- Use Vitest and Vue test utilities for native-shell business logic and Ionic Vue components.
- Use Playwright for browser-based shell and responsive RepoOS-fixture flows.
- Add Appium + WebdriverIO native E2E coverage on Android emulator and iOS simulator; do not mistake browser mobile emulation for native WebView validation.
- Add XCTest and Espresso coverage for custom native code, especially the trusted WebView bridge and biometric lock integration.
- Provide a controlled HTTPS RepoOS fixture server with deterministic auth/test hooks. It must not require a real email inbox or external Cloudflare Access to run automated tests.
- Define PR versus nightly/release test tiers and make the required commands/documentation discoverable.

## Required native E2E scenarios

- [ ] Add, name, persist, edit, reorder, select, and remove locally stored HTTPS server entries.
- [ ] Authenticate to a fixture server, terminate/relaunch the app, and retain its valid session.
- [ ] Add two fixture servers; switch between them and prove their sessions/storage remain isolated.
- [ ] Verify Android Back follows meaningful in-server navigation, then returns to the server picker from the server root.
- [ ] Verify biometric/device lock success and failure behavior.
- [ ] Reject malformed URLs and unsafe schemes including http, file, and javascript.
- [ ] Load a hostile fixture origin and prove it cannot invoke privileged native APIs.
- [ ] Verify offline behavior: the local picker works and an unreachable selected server is clearly reported.

## Acceptance criteria

- [ ] Unit/component, browser E2E, and native E2E commands run independently and are documented.
- [ ] PR CI runs typecheck, unit/component tests, and Playwright against the fixture server.
- [ ] Android emulator native E2E runs in CI; iOS simulator E2E runs where macOS CI is available, at least nightly/release-candidate.
- [ ] Native tests expose stable test IDs for native-shell controls and report actionable artifacts on failure (logs/screenshots where practical).
- [ ] A concise physical-device release checklist covers biometrics, keyboard/safe-area layout, OTP auth, deep links, and notification handoff.

## Activity

- 2026-08-26T15:18:19Z · created · unknown
- 2026-08-26T15:20:43Z · status inbox→ready
