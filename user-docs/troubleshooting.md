# Troubleshooting

## Running RepoOS in more than one repo at once

Each repo gets its own server, and they don't fight over a port. Without a
`servePort` set, `repoos serve` derives a **stable port from the repo's path**
(in the 7200–7999 range), so two repos on one machine never collide. Pin one in
`repoos.toml` only if something external needs a fixed port.

`repoos stop` is safe by construction: it finds its process through a per-port
lockfile and only stops *this* repo's server, never another repo's.

### Telling two running servers apart

`ps` alone won't distinguish two `repoos serve` processes — they're the same
binary. Ask each one instead:

```bash
repoos status          # header shows the repo this checkout belongs to
curl -s localhost:<port>/api/config | grep root
```

`/api/config` reports the `root` the server is actually serving, and
`repoos status` cross-checks the port against that root, so it can tell you
when a port answers but belongs to a different repo.

## Picking a runtime

RepoOS runs under **Bun** when it's on `PATH`, and falls back to Node otherwise.
Control it with environment variables, not `repoos.toml`:

| Variable | Effect |
| --- | --- |
| *(unset)* or `REPOOS_RUNTIME=auto` | Bun if available, else Node. The default. |
| `REPOOS_RUNTIME=bun` | Prefer Bun; warn and stay on Node if missing. |
| `REPOOS_RUNTIME=node` | Always Node. The opt-out. |
| `REPOOS_BUN_PATH=/path/to/bun` | Use a specific Bun binary. |

Bun is substantially faster for the subprocess-heavy work RepoOS does, so the
default is worth keeping unless you have a reason to pin Node. See
[Configuration → Runtime](/configuration#runtime).

## A "check failed" job you can't explain

If `repoos check` fails on a change that couldn't plausibly have caused it, the
triage order matters more than the guesswork:

1. **Does it reproduce in isolation on an idle machine?** If yes, it's a real
   bug — debug it as one. Genuine resource-pressure flakes don't reproduce on a
   quiet box.
2. **Run the whole suite, not just the first failing file.** One root cause
   routinely breaks several suites.
3. **Be suspicious of exact-count assertions against streamed agent output** —
   they present as a *timeout*, not an assertion error, which makes them easy to
   misread as flakiness.

The full triage order and the incidents behind it are in
[debugging check failures](../docs/debugging-check-failures.md) — a
repo-relative link to RepoOS's own build context, so your mileage on the
specific incidents will vary, but the triage order generalizes.

## Logging into a local preview

[Auth](/configuration#authentication) is off by default, and most repos never
turn it on — if that's you, a [task preview](/review-and-close-out#previewing-a-tasks-changes)
opens straight to the app, no login screen.

If you *have* enabled auth, a preview runs behind it like the rest of the
server, so you'll hit a login screen even though it's on your own machine. You
don't need a real inbox to get past it:

- **Email** — any address in your allowlist. If you set a `bootstrapAdmin`,
  use that address.
- **Code** — the value of `REPOOS_AUTH_DEV_BACKDOOR_CODE` in your repo's `.env`.

The dev backdoor only replaces the email-OTP step — the session is otherwise
normal — and it is never honored when `NODE_ENV=production`.

## A task bounced out of `review`

If a task you moved to `review` is back in `active`, that's usually one of two
deliberate self-corrections:

- the **reviewer auto-bounced** it with findings (new commits landed while it
  was in review, or the first review wasn't "good to go"), or
- a **merge conflict** was handed to an engineer to repair in the branch.

Check the task's activity log for the reason. Both are covered in
[Review and close-out](/review-and-close-out); neither is a bug.

## "Stale build" warning

If you run `repoos` from a **source checkout** (the `src/` + `dist/` dev-build
layout) and change `src/`, RepoOS warns that the build is stale — it's running
compiled JavaScript, not your TypeScript. Run the build and carry on:

```bash
bun run build
```

Published installs (no `src/` directory) never see this warning.

## The server won't restart on the port

Each repo's server is recorded in a per-port lockfile so a new `repoos serve`
refuses to silently coexist with a live one. If you manually killed the server
from outside RepoOS, that lockfile can briefly still point at the dead process.
Give the automatic reaper a moment to clear it; if the server has been down for
more than a couple of minutes, check the lockfile in `.repoos/` before
intervening, and never `kill -9` a RepoOS server without checking it first.
