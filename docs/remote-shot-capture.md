# Remote shot capture design

Remote browser evidence uses the configured validation runner and its existing
SSH bundle transport. A runner image must provide Bun, the repository's
development dependencies, Playwright, its WebKit browser, and the system fonts
used by the UI (Liberation and Noto Color Emoji). The browser is installed under `/ms-playwright`, exported as
`PLAYWRIGHT_BROWSERS_PATH`, and made readable to the non-root container user.
The runner checks out the exact task commit, builds the UI,
starts an auth-less preview process in its isolated container, and executes the
existing shot planner and capture/gate code against that preview. Because the
capture runs as the host uid, every path it writes must be writable: the runner
creates a linked worktree for the task branch at `worktreesDir("/repo")` =
`/repo-worktrees` and bind-mounts a host directory there (`validate.sh`'s
`WORKTREES`), with `HOME`/`TMPDIR` pointed at writable mounts and the bun cache
volume chowned to the same uid.

The request contains only the committed git bundle, task id, expected commit,
capture mode, the canonical task body and capture-relevant `[preview]` /
`[[shot.targets]]` config, and the plan the control plane resolved from them. It
carries no environment, dotenv, API-key, or account credentials. The worker uses
that canonical state VERBATIM rather than re-deriving it from the bundle: the
branch's `work/<id>.md` can lag a `## Shots` edit and its detached checkout
cannot re-diff changed paths, so re-planning remotely would capture a different —
or empty — set of entries than local capture. The runner validates the commit
before running. It returns a bounded artifact archive containing PNGs,
`shots.json`, and (for verification) the verification record. The control plane
validates artifact paths and types before unpacking into the existing
`work/.attachments/<id>/shots` and verification locations; the existing activity
and Changes-tab paths remain the interface reviewers see.

Fixtures and step vocabulary are sent as data and interpreted by the same
`shot-plan`, fixture resolver, and page choreography code used locally.
Preview-only servers disable login and seed fixtures in memory. The remote path
covers the automatic handoff capture and UI verification only: manual
`repoos shot` / `repoos verify` stay local (offloading the CLI is a separate
follow-up), and the interactive Preview button remains on the control plane.
Missing browser capability or runner infrastructure failure falls back to local
capture in `runner when available` mode with a visible note. `runner only` fails
with an actionable reason instead of running local work, and a runner failure in
`runner only` is returned as a structured error (never thrown into the Add-shot
route). Capture-plan failures retain local semantics: declared missing targets
fail UI verification/handoff, while automatic misses warn. A partial run imports
every shot the runner did produce and reports the failure, so earlier evidence is
never discarded; a malformed artifact response on a run the runner called
successful is treated as a runner failure and never replaces existing evidence.
Browser concurrency remains bounded by the existing Playwright cap for local work
and the runner's host slot limit for remote work.

The initial Settings policy is `local`, `runner when available`, or `runner
only`; it defaults to `local` until runner images advertise WebKit and the
round-trip has passed a real end-to-end proof. Remote capture is unavailable
when remote validation is disabled. The implementation must not serialize
process environment or secrets into the request bundle.
