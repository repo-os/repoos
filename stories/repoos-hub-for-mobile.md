---
name: RepoOS Hub for Mobile
created_at: "2026-09-23T06:53:10.837Z"
created_by: hello@repoos.org
---
# RepoOS Hub for Mobile

Deliver a production-quality **native iOS and Android RepoOS Hub** that mirrors the product role of the macOS Hub: a privacy-first client for managing **multiple self-hosted RepoOS servers** without reimplementing the full board in native code. Users add and organize servers on-device only; each server remains the source of truth for tasks, agents, and settings. The Hub provides native navigation, session lifecycle, and touch-appropriate workflows while still loading the existing RepoOS web UI where that preserves parity and velocity.

## Background and alignment

The macOS Hub (ADR 0006) established the contract: **native shell + isolated WebView per server origin**, local registry with no credential brokering, and health-checked HTTPS origins. Early mobile work (#0297, #0299) scaffolded the Capacitor shell, server picker, device lock, and branding. Shared design tokens (#0305) align visual language with desktop where the shell is custom UI. This story carries that foundation to a **connected-server experience** that feels intentional on phones—not a shrunken desktop layout in a WebView tab bar.

## Outcomes

When this story is complete, a user can:

1. **Connect and move between servers** with a native shell (header, back/switcher, four primary destinations) that matches mobile platform patterns (Ionic Vue, not faux-native CSS).
2. **Do daily work on the Work queue** via a touch-first queue and task-detail flow that reuses RepoOS APIs and live updates without depending on the multi-column desktop board.
3. **Switch servers without losing context** thanks to persistent per-server sessions, selective background refresh, and predictable app lifecycle behavior (isolated state per origin).
4. **Ship with confidence** via a documented test pyramid: unit/component tests, fixture-backed flows, and real native E2E (Appium/XCTest/Espresso) for WebView isolation, auth persistence, and lock behavior.

## Linked delivery slices

| Task | Focus |
|------|--------|
| **0302** | Connected-server shell: four-tab navigation (Work, Search, More, Settings), More action sheet, Ionic router/header primitives. |
| **0303** | Mobile Work queue and task detail: vertical list, filters, new task, one-handed interactions, shared stores/mutations. |
| **0304** | Per-server session persistence, background updates, SSE/live stream while app is active, lifecycle and isolation guarantees. |
| **0300** | Mobile testing harness, fixture server, PR vs release tiers, native E2E scenarios documented and runnable. |

Implement in an order that keeps **0302** unblocking navigation, **0303** on the primary user journey, **0304** once multi-server switching is real, and **0300** in parallel where it gates merge quality (E2E can trail first vertical slices but must exist before calling the story done).

## Non-goals

- Replacing the RepoOS web app with a full native reimplementation of Agents, Context, Releases, or Settings (those remain in-WebView or deferred native surfaces unless a later story says otherwise).
- macOS Hub feature parity in v1 (menu bar, LRU WebView cap on Mac, Homebrew distribution)—mobile has its own store/signing path.
- Hosted/multi-tenant RepoOS accounts, server discovery, or syncing the server registry through iCloud.
- Changing core RepoOS server auth models beyond what mobile WebView and fixture tests require.

## Principles (carry forward from macOS Hub)

- **Origin isolation:** cookies, storage, and in-memory client state must not leak across servers.
- **User-supplied origins are untrusted:** the shell must not expose filesystem, arbitrary deep links, or cross-origin privileges to server content.
- **Web UI remains canonical** for complex surfaces; native work targets mobility, density, and lifecycle—not feature forks.

## Open questions

- **Hybrid vs native-first Work:** confirm whether Work stays a native Ionic surface only (#0303) while Search/Agents/Context stay WebView routes under the same tab shell, or whether some tabs embed full web routes immediately.
- **Background behavior:** define platform-specific limits for SSE/polling when the app is backgrounded (iOS suspension, Android Doze) and what “selective background updates” means for notifications vs in-app badges.
- **Release channel:** App Store / Play distribution, TestFlight/internal tracks, and naming (“RepoOS Hub” on both platforms) relative to existing `mobile/` README and landing docs.
- **Hub summary API (#0474):** optional future native home/status widgets—out of scope unless we explicitly pull a task into this story later.

## Success criteria

- On a physical device or official emulator/simulator, a user can register two HTTPS RepoOS servers, complete OTP login on each, use the mobile Work flow, switch servers with retained sessions, and pass the native E2E scenarios defined in #0300.
- Documentation (`docs/mobile-architecture.md`, `mobile/README.md`, and user-facing Hub guide when ready) matches shipped behavior and points maintainers at the test commands for PR and release.
