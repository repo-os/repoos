# RepoOS Hub for Mac

RepoOS Hub is a native macOS app for managing **multiple RepoOS servers** from
one place — local projects on your machine and remote servers you can reach over
HTTPS (for example, a server published through a
[Cloudflare Tunnel](/tunnels)).

It complements the RepoOS CLI rather than replacing it: use the CLI, Homebrew,
or npm to run or deploy RepoOS servers, then add those servers to Hub when you
want one desktop place to work across them.

Each server is shown in a sidebar with its own health state. Selecting one loads
that server's ordinary RepoOS web UI in an **isolated window**: every server has
its own sign-in session and cookies, so switching between servers never mixes
accounts, and a server's web page can never reach your files, Keychain, or any
other server.

On top of that shell the Hub adds native conveniences:

- **⌘K quick switcher** — jump between servers, recent pages, pinned tasks, and
  live task hits from the servers you opt in.
- **Pinned tasks** — pin any task across any server for one-click access.
- **Attention & notifications** — badges in the sidebar, native notifications,
  and an optional Dock badge that tell you when agents are running, tasks are
  waiting for review, or tasks need your input.

The Hub is deliberately **not** a second RepoOS client. It renders each
server's real web UI, so everything your server can do is available, and the
Hub adds no write access of its own.

## Download and requirements

Requires **macOS 13 or later**; macOS 14 or later is recommended (on macOS 13,
per-server sessions are held in memory, so sign-in does not survive relaunching
the app — see [Per-server sessions](#per-server-sessions)).

Download the latest [RepoOS Hub DMG](https://github.com/repo-os/repoos/releases/latest/download/RepoOSHub.dmg),
or browse [all RepoOS releases](https://github.com/repo-os/repoos/releases).
Each stable tag includes `RepoOSHub.dmg`.

## Install and first launch

1. Open the downloaded `RepoOSHub.dmg`.
2. Drag the **RepoOS Hub** app into your **Applications** folder.
3. Eject the disk image and open the app from Applications.

### Distribution status

The release pipeline produces an **ad-hoc signed, not-notarized** DMG. That
means the first time you open the app, macOS shows a Gatekeeper warning:

> "RepoOS Hub cannot be opened because it is from an unidentified developer."

To open it anyway, first attempt to open the app and dismiss the warning. Then:

1. Open **System Settings → Privacy & Security**.
2. Scroll to the Security section and click **Open Anyway** for RepoOS Hub.
   macOS shows this option for about an hour after the blocked launch.
3. Confirm **Open** in the next dialog. macOS remembers that exception for later
   launches.

If **Open Anyway** is not available, the Mac may be managed by an organisation
that disallows overrides. Do not bypass that policy. For an unmanaged machine,
an advanced, trust-only fallback is:

```sh
xattr -dr com.apple.quarantine "/Applications/RepoOS Hub.app"
```

Notarization and a stable Developer ID signature are planned but are not in
place yet; treat the DMG as you would any unsigned software you download. A
fully trusted first-launch experience requires that signing and notarization
work, not a different DMG layout.

## Hub settings

The Hub's app-wide preferences live in one settings window. Open it from the
**`…` button at the top right of the Hub window** (next to the back/forward/
reload controls, labelled "RepoOS Hub settings"), or with the standard macOS
**`⌘,`** shortcut. Both open the same window — there is no second app-level
settings surface. Per-server settings stay where they are: right-click a
server → **Notifications…** for attention, capability tokens, and
cross-server search.

The settings window holds four sections:

- **Appearance** — `System` (the default), `Light`, or `Dark`. It restyles the
  native Hub shell immediately — sidebar, workspace chrome, sheets, popovers,
  and the ⌘K palette — with no relaunch, is remembered next launch, and moves
  the Dock icon with it. It never touches the embedded server pages: each
  server's web UI keeps whatever theme its own web settings use, and the Hub
  injects no theme into any web view.
- **Updates** — shows the installed version and build, with a **Check for
  Updates** button (see [Updates](#updates)).
- **Notifications** — the global **Native notifications** and **Dock badge
  total** toggles (both on by default). These used to live in the standard
  `Settings` scene; they moved here so the Hub has exactly one settings
  surface, with unchanged labels, behavior, and defaults.
- **About** — the app version and build.

## Updates

Check from inside the app: open Hub settings (`…` → settings, or `⌘,`) and
use **Check for Updates** in the Updates section. It shows the installed
version and build, queries the GitHub latest-release endpoint on demand, and
reports one honest outcome: you're up to date, a specific newer version is
available, or the check could not complete (offline, rate-limited, or an
unexpected response — a failed check never claims an update is available).
Only stable releases are offered; prereleases are never suggested. The result
is cached for about six hours; pressing the button again re-checks.

The check is advisory only: it never downloads or installs anything and adds
no updater dependency. When an update exists, the window links out to the
[releases page](https://github.com/repo-os/repoos/releases), plus a direct
download button when that release actually ships the `RepoOSHub.dmg` asset
— both open in your default browser. To install,
download the latest `.dmg` and repeat the install steps below — the DMG is
ad-hoc signed and not notarized (see
[Distribution status](#distribution-status)), so an in-app replace would hit a
Gatekeeper warning; the button links out instead.

You can also update by hand at any time: download the latest `.dmg` from the
[releases page](https://github.com/repo-os/repoos/releases) and repeat the
install steps.

Your servers, pinned tasks, and preferences are stored locally in
`~/Library/Application Support/RepoOS Hub/` and are preserved across updates.

## Your servers

### Add a server

Click **Add server** at the bottom of the sidebar (or press **⌘⇧N**) and paste a
server address:

- `localhost:7171` for a local instance (loopback HTTP is fine),
- `repo.example.com` or `https://repo.example.com` for a remote server.

The app saves an entry **only after a successful health check**: it calls
`GET {address}/api/health`, requires a `2xx` response with `ok: true` from the
same origin, and never follows cross-origin redirects. A timeout, TLS failure,
redirect, non-`2xx` status, invalid JSON, or a response that isn't `ok: true`
fails the add with an explanatory message — the Hub will not silently save an
address it couldn't verify.

Details the add sheet gets right for you:

- A bare `localhost`/`127.0.0.1` address is treated as `http://`; any other
  bare host is treated as `https://`.
- **Remote servers must be HTTPS.** Plain HTTP is accepted only for loopback
  hosts (`localhost`, `127.0.0.1`, `::1`). There is no "allow insecure HTTP"
  option for remote servers.
- Addresses are normalized on save: credentials, query strings, fragments, and
  paths are rejected — use the server root origin only. Duplicate origins are
  rejected.
- The sidebar name comes from the server's reported repository name (falling
  back to its host and port). You can change it afterwards.
- The add sheet also scans ports `7000–7999` for **running local RepoOS
  servers** and lists them under "Running locally" — click **+** next to one to
  fill in its address.

### Edit a server

Right-click a server in the sidebar and choose **Edit server…** to change its:

- **Display name**
- **Origin** (editing the origin re-runs the health check before saving)
- **Group** (servers are grouped into labeled sidebar sections)
- **Icon** (an SF Symbol name)
- **Accent color** (a `#RRGGBB` hex value)
- **Pinned in sidebar** (see below)

### Pin and reorder servers

Servers you pin float in a **Pinned** section at the top of the sidebar,
separate from their group. Right-click → **Pin server** (or **Unpin server**),
and drag rows to reorder within a section.

### Remove a server

Right-click → **Remove server**. This deletes the server from the registry
**and** its isolated website data (sign-in, cookies) and any stored Hub
capability. Removing is irreversible, but you can re-add the same address any
time — it starts with a fresh sign-in.

### Health and offline states

Every server shows a status color:

| State | Color | Meaning |
| --- | --- | --- |
| Not checked | gray | Health hasn't been verified yet |
| Healthy | green | `/api/health` returned `ok: true` |
| Offline | red | The server can't be reached (timeout, TLS failure, network error) |
| Invalid response | yellow | Reachable, but `/api/health` did not report `ok: true` — probably not a RepoOS server |

Hover the row for details (last checked time, repository, address), and click
the info/badge control for a details popover with runtime info and attention
counts.

Health is **advisory**: a failed check never changes your saved entry. The
sidebar stays fully usable while a server is offline — selecting an offline
server shows a native error state instead of pretending there's a session.

### Local servers: start, stop, restart

For a **loopback** server whose health response includes its repository root,
the server's context menu gains **Start local server**, **Stop local server**,
and **Restart local server** entries. These run the `repoos service` command
for that project (using a `repoos` on your PATH or at the standard Homebrew/Bun
install locations). The entry appears once the Hub has seen the server online
at least once, so it knows where the project lives.

## Switching and the keyboard workflow

**⌘K** opens the **Quick Switcher** — a command palette over everything in your
registry:

- servers (by display name, origin, group),
- recent pages per server (the last ~8 routes you visited),
- pinned tasks,
- live task hits from servers with cross-server search enabled (see
  [Attention & notifications](#attention-and-notifications)),
- and **Add server…**.

Type to filter, use **↑/↓** to move, **Return** to open, **Esc** (or click
outside) to close. Committing a hit switches to that server and navigates to
the page. Remote task searches are debounced (~350 ms) and cancellable, never
building a central index — each server is queried on its own.

Other native commands live in the standard menus:

- **File → Add Server…** (`⌘⇧N`)
- **Go → Quick Switcher…** (`⌘K`), **Back** (`⌘[`), **Forward** (`⌘]`), **Reload** (`⌘R`)
- Reload targets the embedded web page when one is loaded; otherwise it
  re-checks the server's health.

## Pinning tasks across servers

Two different things can be pinned: **servers** (above) and **tasks**.

To pin a task:

1. Right-click its server in the sidebar → **Pin task…**.
2. Enter the task number — `1` or `0001` both work.
3. The Hub looks the task up on that server, stores a local shortcut with the
   task's real route and title, and adds it to the **Pinned tasks** section at
   the top of the sidebar.

Remote servers must be paired (see
[Remote capability tokens](#remote-capability-tokens)) before you can pin their
tasks — the Hub resolves the task through the server's read-only search API,
never by scraping the web page.

Clicking a pinned task switches to that server and opens the task. A pin is a
**local route hint, not a cached copy of the task**: opening it always loads
the live task from the server through the normal navigation checks.

- **Deleted tasks** — if the task no longer exists, the server's board shows
  its usual not-found state. Unpin the stale entry via its context menu
  (**Unpin**).
- **Offline servers** — if the server is offline, opening a pin shows the
  native failure state (Retry / Edit server… / Clear sign-in / Remove server).

Removing a server also removes its pins.

## Attention and notifications

The Hub can show you, at a glance, what's happening on every server without
opening the board.

### What counts as attention

A server's attention summary is a compact, server-computed snapshot of three
counts:

- **Active agents** — agents currently running on that server.
- **Review-ready tasks** — tasks whose status is `review`, waiting for a human.
- **Needs-input tasks** — tasks flagged as needing your input.

### Where attention appears

- **Sidebar badges** — each server shows up to three small badges: blue =
  in review, orange = needs input, purple = active agents (capped at `9+`).
- **Server details popover** — the exact counts, with a plain-language
  explanation of what each means.
- **Native notifications** — fired when a count *increases* (a task lands in
  review, a task waits for input, agents start from zero). Clicking one opens
  the server at the right page (`/work` or `/agents`).
- **Dock badge** — an optional badge summing *in-review + needs-input* across
  all servers with attention enabled.

### Enabling and disabling it

**Per server** — right-click the server → **Notifications…**:

- **Enable attention and notifications** — master switch for that server's
  aggregation. Local loopback servers pair automatically and need nothing else;
  remote servers need a capability token (below).
- **Notify me when counts increase** — three toggles: _Tasks ready for review_
  (on by default), _Tasks needing input_ (on by default), _Agents start
  running_ (off by default).
- **Include this server in cross-server task search** — lets ⌘K query this
  server's tasks directly. Off by default.

**Globally** — Hub settings (`…` button, or `⌘,`):

- **Native notifications** (on by default)
- **Dock badge total** (on by default)

Notifications stop firing when a count returns to zero or stays flat — they
announce *increases*, not every poll.

### Local vs. remote servers

- **Local (loopback)** — attention works with zero setup. The Hub reads the
  server's bounded summary API over the local connection; no token or
  sign-in handoff is needed.
- **Remote** — attention and cross-server search need a scoped **Hub
  capability token** created on the server and stored in your Mac's Keychain.
  Automatic remote pairing isn't available yet; you paste the token once in the
  server's Notifications sheet (see below).

### Polling and freshness — why you shouldn't treat a badge as "right now"

Attention is **polled**, not pushed:

- The selected server refreshes roughly every **30 seconds**; background
  servers roughly every **2 minutes**.
- Failures back off exponentially (up to ~15 minutes between attempts) instead
  of hammering an offline server.
- A summary is labelled **fresh** when it's young enough (≤ 90 s for the
  selected server, ≤ 6 min for background servers), **stale** when it's older,
  and **unavailable** when there's no capability or the server rejected it.

Badges keep showing the **last known counts** until the next successful poll,
which means a "stale" or offline badge reflects the last successful read, not
the current state. The details popover tells you how fresh a summary is. In
particular:

- A server that goes **offline** keeps its last counts on screen but stops
  updating; the summary eventually goes stale/unavailable.
- **Don't make a decision on a stale or offline number** — open the server and
  look at the live board.

If the server ever **rejects your capability** (`401` — expired, revoked, wrong
origin), the Hub removes the stored token from the Keychain, marks that
server's summary unavailable, and in cross-server search reports
`unauthorized — rotate Hub capability`.

## Local loopback access (no token needed)

Servers reached over **loopback** — `localhost`, `127.0.0.1`, or `::1` — may
use the Hub's bounded summary and task-search APIs **without any capability
token**. This is what makes the per-server "Enable attention and notifications"
toggle work for normal local development with no pairing ceremony.

Two things to understand about this exception:

- The server verifies the **actual network peer** is a loopback address
  (`127.*`, `::1`). Forwarded headers and the `Host` header **cannot** turn a
  remote request into a local one, so this exception never applies over a
  tunnel, a proxy, or any forwarded/remote connection.
- It covers only the two bounded Hub endpoints — summaries and task search.
  Everything else on a local server still needs a normal sign-in.

## Remote capability tokens

Remote servers (and any HTTPS server) authorize Hub attention and search with a
**Hub capability**: a short-lived bearer token issued by the server, stored in
your Mac's Keychain, and sent only to that one server.

### What a capability authorizes

A new capability carries two read-only scopes:

- **`summary:read`** — read that server's attention summary (the three counts
  above). No task titles, bodies, activity, or filesystem paths.
- **`search:read`** — run bounded task searches (`/api/hub/v1/tasks/search`),
  returning only task id, title, status, `updatedAt`, and a deep link.

### What a capability does NOT authorize

A Hub capability is deliberately narrow. It grants **no**:

- browser session or cookie access — it cannot read or act as your `repoos_session`,
- task creation, mutation, deletion, or status changes,
- filesystem access, agent control, or configuration access,
- access on any other origin — it is bound to the exact HTTPS origin it was
  issued for, and rejected everywhere else.

### Create a capability

Capabilities are created on the server **while you are signed in**, over its
HTTPS origin. The web UI does not yet have a Hub pairing screen, so create one
from your signed-in session with the server's API. From a browser where you're
signed in to the server, open the console, or use a signed-in HTTP client:

```sh
curl -X POST https://repo.example.com/api/auth/hub-capabilities \
  -H "Cookie: repoos_session=<your session cookie>" \
  -H "Content-Type: application/json" \
  -d '{"label":"My Mac Hub","expiresInSeconds":2592000}'
```

The response contains the plaintext token once, plus a warning:

```json
{
  "capability": { "id": "hub_…", "label": "My Mac Hub", "scope": "summary:read search:read", "expiresAt": "…" },
  "token": "roh_…",
  "warning": "Store this token in the macOS Keychain. It will not be shown again."
}
```

Capabilities expire no later than **90 days** (the default is 30 days), are
audience-bound to the Hub app, and are recorded by the server only as a digest —
the server can never show you the token again.

> **If you lose the token, don't look for it — rotate it.** The plaintext is
> shown exactly once.

### Enter the token in the Hub

1. Right-click the remote server in the sidebar → **Notifications…**.
2. Under **Advanced remote pairing**, paste the `roh_…` token and click
   **Save capability token**.
3. Flip **Enable attention and notifications** on (and optionally enable
   cross-server task search).

The token is stored in the **macOS Keychain**, keyed to that server and its
exact canonical origin. The Hub never writes it anywhere else.

### Rotate and revoke

- **List** — `GET /api/auth/hub-capabilities` lists your capabilities'
  metadata (id, label, expiry, last use) — never the token.
- **Rotate** — `POST /api/auth/hub-capabilities/<id>/rotate` revokes the old
  token first, then returns a fresh one exactly once. Use this routinely:
  rotating invalidates any token that may have leaked.
- **Revoke** — `DELETE /api/auth/hub-capabilities/<id>` makes the token stop
  working immediately. In the Hub, use **Remove stored capability** under
  Advanced remote pairing to drop it from your Keychain.

### Safe handling

The token is a plaintext credential roughly equivalent to a session password.
Treat it accordingly:

- **Shown once** — copy it straight into the Keychain field; do not screenshot
  or email it.
- **Never paste it into tasks, logs, URLs, browser storage, or chat.**
- **Never share it** — it's scoped to your account on that server.
- **After any loss or suspected exposure, rotate (or revoke) it immediately.**
  Because the token is origin-bound and read-only, a leaked token can only read
  summaries and run task searches on that one server — but you should still
  rotate rather than reason about "how bad it is".

### Expired, revoked, or wrong-origin tokens

If a token is expired, revoked, malformed, or presented to a different origin
than the one it was issued for, the server answers `401` on the Hub endpoints.
The Hub then:

1. removes the stored token from your Keychain,
2. marks that server's summary **unavailable**,
3. reports `unauthorized — rotate Hub capability` in cross-server search.

Create or rotate a capability on the server and re-enter the new token. Token
revocation and rotation are logged on the server with only the id, label,
origin, and actor — never the token itself.

## Sign-in, sessions, and the browser boundary

### Per-server sessions

Each server has an **isolated** cookie/web-storage store keyed to that server —
two servers' sessions never share cookies, even when their hostnames look
similar, and the Hub never reads, copies, or exports a session cookie to the
Keychain. Sessions survive switching between servers; whether they survive an
app relaunch depends on your macOS version:

- **macOS 14 or later** — sessions are persisted on disk per server and survive
  relaunching the app.
- **macOS 13** — per-server stores are kept in memory (the identifier-backed
  persistence API is macOS 14+), so isolation and switching work the same, but
  sign-in is dropped when you quit the Hub.

- **Clear sign-in** (on the failure overlay) wipes **only that server's**
  sign-in data — other servers stay signed in.
- **Remove server** deletes that server's store entirely.

### HTTPS expectations

Remote servers must be served over **HTTPS**. Loopback HTTP (`http://localhost:7171`)
is supported for local development only. If a server is served over plain HTTP
on a non-loopback host, add it via an HTTPS reverse proxy first — the Hub has no
"allow insecure" option, on purpose: weakening TLS would blur the boundary
between who owns a session.

### WebKit and SSO limitations

The Hub renders each server in an embedded WebKit view with strict navigation
rules:

- Same-origin pages (the board, `/login`, `/api/*`, task routes) load normally.
- External HTTPS links (documentation, OAuth providers) open in your **default
  browser** after a confirmation sheet — they never silently replace the
  embedded view. Pop-ups, non-user-initiated external navigations, and
  downloads are blocked.
- RepoOS's email OTP sign-in works in the embedded view.

Some **enterprise SSO providers reject embedded WebKit views** (device posture
checks, client certificates, or browser restrictions). The Hub does **not**
bypass those, and it cannot copy cookies between Safari and the web view —
signing in with provider X in Safari does not sign you in inside the Hub. If a
provider blocks the embedded view, the Hub offers **Open in browser** only when
the server/provider supports a safe return flow; otherwise contact your
administrator.

## Troubleshooting

### Adding a server fails

| Error | What it means | Fix |
| --- | --- | --- |
| "The server did not respond before the timeout." | No response within ~10 s | Check the address, port, and that the server is running |
| "Could not establish a secure HTTPS connection." | TLS handshake/certificate problem | Verify the certificate; use a trusted local cert or HTTPS reverse proxy for local dev |
| "The server returned HTTP 4xx/5xx." | The endpoint answered, but not with `2xx` | Confirm this is a RepoOS server; check its logs |
| "The server redirected away from …" | A redirect left the origin | Use the canonical server origin (no path/redirects) |
| "The health response was not valid JSON" / "…did not report ok: true" | Not a RepoOS server | You may be pointing at the wrong service |
| "A server with this origin is already saved." | Duplicate | Edit the existing entry instead |

### A server shows Offline

The sidebar stays usable. Select the server to see a native failure overlay with
the origin and the reason class (TLS, timeout, HTTP status, invalid RepoOS
health, or blocked navigation), plus **Retry**, **Edit server…**, **Clear
sign-in**, and **Remove server**. For a local server, you can also try **Start
local server** from its context menu once the Hub has seen the project path.

### A pinned task says the task doesn't exist

Pins are route hints, not caches. The task was probably deleted or its id
reused on a re-initialized board. Unpin the stale entry and pin again if the
task now has a different id.

### Sign-in is blocked / an SSO provider won't load

External sign-in providers open in your system browser via the **Open in
browser?** sheet. The Hub cannot use your Safari cookies or otherwise bypass
the provider's embedded-browser restrictions — see
[WebKit and SSO limitations](#webkit-and-sso-limitations).

### Notifications or badges don't appear

Work through, in order:

1. **Hub settings → Native notifications** is on (the `…` button, or `⌘,`),
   and macOS granted the app
   notification permission.
2. The server has **Enable attention and notifications** on (server context
   menu → **Notifications…**).
3. For a **remote** server, a valid capability token is stored under Advanced
   remote pairing, and the summary isn't `unavailable`.
4. For "agents start" notifications specifically: that toggle is **off by
   default**.

### Cross-server search finds nothing

- The server must have **Include this server in cross-server task search**
  toggled on (Notifications sheet).
- Remote servers need a capability token that includes `search:read` (all new
  tokens include it; older summary-only tokens return `401` on search until
  rotated).
- The palette footer reports each server's status (`offline`, `unauthorized —
  rotate Hub capability`, `no Hub capability`) — read those lines.
- Queries must be 2–80 characters; results are capped at 8 per server.

### The Dock badge is wrong

It sums *in-review + needs-input* only across servers with attention enabled,
and it falls back to the last known counts when a server is stale — check the
server details popover for freshness. Disable it in **Hub settings → Dock badge
total** (the `…` button, or `⌘,`).

## Further reading

- [Authentication](/authentication) — setting up server sign-in (email OTP,
  Google OAuth).
- [Tunnels](/tunnels) — publishing a local server so a remote Hub can reach it
  over HTTPS.
- The Hub's security boundary is documented in the RepoOS source tree at
  `docs/native-hub-capabilities.md`, `docs/native-hub-webkit.md`, and
  `docs/adr/0006-macos-repoos-hub.md`.
