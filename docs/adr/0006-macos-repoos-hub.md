---
status: accepted
date: 2026-09-21
deciders: repoos maintainers
---

# 0006 — The macOS RepoOS Hub is a native shell around isolated server web UIs

## Context

Users can run several RepoOS servers locally and can also reach servers through
an HTTPS tunnel. A macOS app should make those servers easy to switch between
without turning the desktop app into a second RepoOS client, a credential
broker, or a privileged plugin host.

The boundary matters because a server URL is user-supplied content. A
compromised server, a malicious task description, or an XSS in a server's web
UI must not gain access to the user's files, Keychain, shell, or the native
application's state. At the same time, the existing RepoOS web UI should remain
the one complete product surface; the Hub must not fork or partially reimplement
it.

## Decision

Build a macOS-first app with three deliberately separate parts:

1. **Native shell:** SwiftUI windows, navigation sidebar, server registry,
   health indicators, pinned-context metadata, and keyboard commands.
2. **Selected-server content:** the ordinary RepoOS web UI loaded in a
   `WKWebView`. The server is rendered as a browser origin, not as a native
   plugin.
3. **Local registry:** a small local-only store of server descriptors. It
   contains no passwords, session cookies, OAuth tokens, task data, or server
   snapshots.

The first implementation is a native Swift/SwiftUI macOS target using
`WKWebView` from WebKit. It is not Electron, Catalyst, or a Capacitor wrapper.
SwiftUI provides native sidebar, menu, command, lifecycle, accessibility, and
window behavior; WebKit preserves feature parity with the existing web UI and
keeps server-specific UI out of the native release cycle. This is appropriate
for a macOS-first app because the shell is small and platform-specific while
the high-change product surface remains the existing web application.

The Hub does not add a runtime dependency to the core RepoOS package. The
native target has its own Xcode project and dependency policy.

## Local server registry

The registry is stored locally in the app's application-support container
(Swift Codable/JSON or SQLite is an implementation choice; v1 should choose
the simplest audited format). It is not synced through iCloud and is never
uploaded to a RepoOS server.

```text
ServerEntry {
  id: UUID                 // stable local identity
  name: String             // user label, 1..80 Unicode scalars
  origin: URL              // normalized https origin, no path/query/fragment
  createdAt: Date
  updatedAt: Date
  lastHealth: HealthState  // unknown | healthy | unreachable | invalid
  lastHealthAt: Date?
  sortOrder: Int
}
```

`origin` is the only network address stored. On add or edit, normalize by
trimming surrounding whitespace, parsing as a URL, lower-casing the scheme and
host, removing the default HTTPS port (`:443`), and removing a trailing slash.
Reject credentials, fragments, queries, non-HTTPS schemes, an empty host,
IP literals that are not valid URL hosts, and paths other than `/` (users can
enter a server root URL, not an arbitrary endpoint). Preserve a non-default
port because local HTTPS development servers may use one. Internationalized
hostnames are converted to their URL parser's canonical ASCII form before
comparison. Deduplicate by canonical origin; editing the display name does not
create another entry.

### Add and reachability contract

An entry is saved only after a bounded request to `GET {origin}/api/health`.
The request follows no cross-origin redirects. The final response must remain
the same HTTPS origin, have a 2xx status, and parse as JSON with `ok: true`.
The response may include the normal RepoOS fields (`version`, `buildAt`,
`buildHash`, `root`, `projectName`, and so on), but the Hub relies only on
`ok: true` for v1. A timeout, TLS failure, redirect, non-2xx response, invalid
JSON, or `ok` other than `true` is an add failure with an actionable message;
it must not silently save an unchecked URL.

The request has a short timeout (10 seconds maximum) and is cancellable. A
previously saved server is not deleted when a later health check fails. Health
is advisory after save, and selecting an unhealthy entry shows an offline
state rather than inventing a RepoOS session.

HTTPS is mandatory for every origin except loopback hosts, which may be saved
over plain HTTP (`localhost`, `127.*`, `::1`) because `repoos serve`'s default
origin is plain-HTTP loopback. There is no "allow insecure HTTP" preference for
arbitrary origins: the origin normalizer rejects HTTP for any non-loopback
host, and tokenless access to the bounded Hub endpoints additionally requires
the server to verify the actual socket peer is loopback (see
[native-hub-capabilities.md](../native-hub-capabilities.md)). Weakening TLS any
further would blur the same-origin cookie and credential boundary.

> **Amended at implementation (2026-09-22):** the original decision made HTTPS
> mandatory even for loopback and private-network hosts. Keeping the TLS
> boundary unambiguous for everything remote, the shipped normalizer allows the
> plain-HTTP loopback exception only for local development, matching how the
> server is normally run locally.

## Navigation and interaction model

The main window is sidebar-first:

```text
Sidebar                         Content
  Servers                       selected server's RepoOS web UI
    ● Local repo
    ○ Team tunnel
  Pinned                        optional task contexts
    Local repo · #0042
  + Add server
```

Selecting a server makes it the active workspace and loads only that server's
origin. A pinned task context is a local navigation hint consisting of
`serverID`, task identifier, and the last known task route; it is not a cached
task record. Pins are optional, can be stale, and are opened only after the
associated server passes the normal navigation checks. v1 need not guarantee
that a task still exists.

`Cmd-K` opens a native switcher over servers and pins. It searches display name,
canonical origin, and the local task identifier, supports arrow-key navigation,
and commits the selected workspace with Return. It never searches server
content or sends a query to every server. Standard macOS commands (new window,
close window, hide, and quit) remain native menu commands.

## WebKit trust boundary

The `WKWebView` is an untrusted-content boundary:

- Do not register `WKUserContentController` message handlers for server pages.
- Do not expose `window.webkit.messageHandlers`, a JavaScript bridge, custom
  URL scheme, native file picker, shell command, or Keychain API to page code.
- Do not inject privileged or application-owned JavaScript into server pages.
  A narrowly scoped, non-privileged presentation setting (for example,
  preferred color scheme) must be implemented through WebKit configuration,
  not a script bridge.
- Keep registry and command handling in SwiftUI/native views outside the
  web view. Page-originated events cannot mutate native state.
- Do not grant file read/write access, camera/microphone access, downloads to
  arbitrary paths, or universal clipboard access to the web view.

The web view may use normal browser APIs needed by the existing RepoOS UI. A
server can access only its own origin's web storage and cookies, subject to
WebKit policy. This is defense in depth, not a claim that server HTML is
trusted.

### Cookies and session isolation

Each server gets a distinct `WKWebsiteDataStore` (or, at minimum, a store
whose cookies are partitioned and keyed by the canonical origin). The store is
selected by `serverID`, never shared with the native shell, and never shared
between server entries merely because their hostnames look similar. The
server's normal `HttpOnly`, `Secure`, `SameSite=Lax` session cookie remains
managed by WebKit; the Hub never reads, copies, exports, or places it in the
Keychain. Sessions persist across app launches unless the user explicitly
signs out/clears that server's data. “Sign out” clears only that server's
website data and does not affect other entries.

### Navigation policy

The web view permits top-level navigation and subresource requests only when
the effective origin is the selected canonical origin. Same-origin paths such
as `/login`, `/api/*`, and task routes are allowed. Cross-origin redirects,
popups, frames, and navigations are denied by default; a request to another
origin is not a way to join or switch servers.

Links intended to leave the selected origin (including `mailto:`, `tel:`, and
ordinary external HTTPS links) are handed to `NSWorkspace`/the default
browser after user activation. They do not silently replace the RepoOS web
view. Non-user-initiated external navigations are blocked. Downloads and
print requests require native user confirmation and are not granted an
unbounded filesystem destination. No arbitrary custom URL scheme is accepted
from page content.

OAuth/SSO is best-effort browser behavior, not a Hub feature. RepoOS email OTP
works in the web view. An identity provider may reject embedded WebKit,
require a system browser, require device posture, or require a client
certificate unavailable to the app. v1 must show the provider's failure and
offer “Open sign-in in default browser” only where the server/IdP supports a
safe return flow; it must not copy OAuth cookies or tokens between the system
browser and WebKit. The Hub does not bypass Cloudflare Access or implement an
OAuth broker.

## Failure and offline states

The native sidebar remains usable without a network. Each entry displays
`Not checked`, `Healthy`, or `Offline` with the last successful check time.
When selected content cannot load, show a native error state containing the
canonical origin, the reason class (TLS, timeout, HTTP status, invalid RepoOS
health, or blocked navigation), Retry, Edit server, and Remove server actions.
Never display stale task or aggregate data as current. A previously rendered
web page may remain in memory while a transient request fails, but it must be
visibly marked unavailable and must not accept an action presented as
successfully completed.

## Capability boundary and version scope

### v1

V1 provides only local registry management, `/api/health` reachability,
server switching, ordinary authenticated web UI rendering, per-server
session isolation, pins as local route hints, and `Cmd-K` switching. It does
not fetch authenticated APIs from the native layer, aggregate task counts,
show cross-server notifications, synchronize pins, or read server cookies.

> **Amended at implementation (2026-09-22):** the paragraph above is the
> shell-only first milestone. Since the capability contract described under
> "v2 gate" below landed, the Hub also polls capability-gated attention
> counts, shows native notifications and a Dock badge, and searches tasks
> across opted-in servers — all read-only aggregates over the bounded Hub
> endpoints. Pins are still local route hints and are never synchronized
> across servers.

### v2 gate

Authenticated aggregate status is allowed only after a server explicitly
supports a Hub capability. That capability must be:

- issued by the server after the user authenticates there;
- scoped to the minimum read-only aggregate endpoints and selected server;
- audience-bound to the Hub app and have an expiry;
- revocable by the server (with revocation taking effect on the next request);
- represented by a protocol version and server identity, with no implicit
  reuse of the normal web session cookie.

Without that explicit, documented, revocable capability, v2 must not poll
authenticated APIs, infer status from rendered HTML, or send credentials to
other servers. Capability design and server-side implementation require a
separate ADR and security review.

The server contract for this gate is documented in
[Native Hub capabilities](../native-hub-capabilities.md): the v1 endpoint is
`GET /api/hub/v1/summary`, authenticated by a server-issued `summary:read`
bearer capability. The native client stores that capability in the macOS
Keychain and sends it only to its exact bound HTTPS origin.

## macOS build, signing, testing, and release assumptions

The app is a separate Swift Package/Xcode target with a declared minimum macOS
version chosen when implementation starts (targeting a currently supported
macOS release, with WebKit APIs available on that floor). RepoOS's TypeScript
package remains zero-runtime-dependency; the Hub's native build is not part of
the server's runtime bundle.

Release builds use a stable Apple Developer ID application identity, hardened
runtime, and notarization/stapling for distribution outside the Mac App Store.
Entitlements are minimal: network client access and only the sandbox
permissions required by the chosen download/print behavior. No Keychain
entitlement, automation entitlement, shell execution entitlement, or arbitrary
file entitlement is needed for v1. Signing and notarization credentials stay in
CI secrets, never in the repository.

Tests are layered:

- Swift unit tests for URL canonicalization, registry migration/validation,
  deduplication, health response parsing, navigation decisions, and pin
  routing.
- WebKit integration tests with a local HTTPS fixture using valid and invalid
  health responses, redirects, cookies, popups, external links, and offline
  transitions. Tests assert that no message handler or privileged script is
  present in the page.
- UI tests for sidebar selection, Cmd-K keyboard flow, add/edit/remove, and
  failure states.
- A signed/notarized smoke build on a clean macOS runner, including launch,
  add a fixture server, authenticate through the ordinary web UI, relaunch,
  and verify per-server session separation.

The existing RepoOS build, test, and UI smoke checks remain unchanged and
continue to validate the web product. The Hub gets its own Xcode/Swift test
and release workflow; it is not scaffolded by this ADR.

## Consequences

This keeps the native code small, preserves web UI parity, and makes the
untrusted-server boundary auditable. It also means the Hub cannot provide
native aggregate dashboards in v1, cannot guarantee every enterprise SSO
provider works inside WebKit, and cannot use the system browser's existing
cookies. Those are deliberate costs of not turning a user-supplied server
into a privileged native extension.

## Related

- [0004 — Core stays minimal; project-specific integrations are plugins](0004-plugin-architecture.md)
- [Native authentication](../native-auth.md)
- [macOS Hub WebKit boundary](../native-hub-webkit.md)
- [Mobile hub architecture](../mobile-architecture.md)
