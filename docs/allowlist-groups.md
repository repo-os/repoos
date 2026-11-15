# Allowlist groups (#1132)

Projects that belong to the same company share the same coding agents, model
providers and quotas. Before groups, every project's budget allowlist lived only
in its own committed `repoos.toml`; a Codex pause had to be hand-edited and
committed once per project, and nothing noticed when the copies drifted. The
tailnet as a whole must never share one allowlist: different companies must not
leak CLIs, models or pause state into each other.

## Shape

- A project opts in with `budget.allowlistGroup = "<name>"` in its own
  `repoos.toml`. Unset = today's project-only behaviour, byte for byte.
- The group's state is **machine-local**: one TOML file per group at
  `~/.config/repoos/allowlist-groups/<name>.toml`
  (`REPOOS_ALLOWLIST_GROUPS_DIR` overrides the directory for tests and unusual
  setups). It has `version` and `updatedAt`; newer `updatedAt` wins, `version`
  breaks ties. The file is never committed, never pushed, and its parser only
  keeps the five allowlist fields, so a credential cannot ride along.
- `[[budget.allowlist]]` rows in the project are overrides on top of the group:
  models union, a pause on either side stays a pause, per-model pauses merge
  with the project's entry winning for the same model. Project-only rows append.
- Budget Controls shows the group name, a `group` / `project` badge per row, a
  drift warning when the effective list differs from the group, and
  **Re-sync from group** (drops project rows for CLIs the group defines; keeps
  project-only additions).

## Pause/resume and propagation

`repoos allowlist pause|resume <cli> [model] [--until] [--reason]` and the
Budget Controls buttons mutate the group (never the committed project file) and
then propagate:

1. The local write bumps `version`/`updatedAt` and reloads the live config.
2. Members on this machine share the group file. `ConfigWatcher` includes the
   group file in its change signature, so any running local server adopts the
   pause within one poll interval without a restart.
3. Other machines are found with the same trusted discovery #1127 added
   (`repoos servers --json` over SSH / `GET /api/servers/tailnet`). Registry
   entries publish `allowlistGroup`, and only rows declaring the **same group
   name** are members. Unreachable hosts carry no declaration and are excluded.
4. Each remote member runs `cd <member root> && repoos allowlist group apply
   --payload-base64 <b64> --check-logins`. That is authenticated by the SSH
   credentials discovery already uses — there is no unauthenticated write
   endpoint. The receiver verifies that *that* checkout declares the group,
   refuses older state, and only writes its own machine-local group file.
5. The result lists **applied**, **unreachable** or **refused** per project and
   host. The receiver also reports allowed CLIs the host is not logged in to;
   logins and credentials are never synced.

Timed pauses (`pausedUntil`) need no timer: selection evaluates the deadline at
call time, so an expired pause stops blocking starts on every member.

## Security boundaries

- The group name becomes a filename; names are validated
  (`[A-Za-z0-9][A-Za-z0-9._-]{0,63}`) so a hand-edited config cannot traverse
  paths.
- The HTTP routes sit behind the normal auth middleware, and the receiver
  refuses a payload for a different group.
- The API never accepts a client-supplied host list for propagation: the server
  rediscovers same-group members itself and SSHes only to those.

## Tests

`src/ui-app/tests/allowlist-groups.test.ts` covers the merge table, provenance,
drift/re-sync, the on-disk store (round-trip, corruption, last-writer-wins),
config loading with and without a group, member filtering, remote outcome
classification, and a route test proving a pause in group `acme` leaves a
project in group `personal` untouched and out of `repoos.toml`.
`src/ui-app/tests/budget-controls-panel.test.ts` covers the group card,
source badges, drift banner, member confirmation list, and the group pause
request.
