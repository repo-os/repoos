# Remote shot capture design

Remote browser evidence uses the configured validation runner and its existing
SSH bundle transport. A runner image must provide Bun, the repository's
development dependencies, Playwright, its WebKit browser, and the system fonts
used by the UI. The runner checks out the exact task commit, builds the UI,
starts an auth-less preview process in its isolated container, and executes the
existing shot planner and capture/gate code against that preview.

The request contains only the committed git bundle, task id, expected commit,
capture mode, and the ordinary task/shot-plan data needed to reproduce the
capture. It carries no environment, dotenv, API-key, or account credentials.
The runner validates the commit before running. It returns a bounded artifact
archive containing PNGs, `shots.json`, and (for verification) the verification
record. The control plane validates artifact paths and types before unpacking
into the existing `work/.attachments/<id>/shots` and verification locations;
the existing activity and Changes-tab paths remain the interface reviewers see.

Fixtures and step vocabulary are sent as data and interpreted by the same
`shot-plan`, fixture resolver, and page choreography code used locally.
Preview-only servers disable login and seed fixtures in memory; the normal
interactive Preview button remains on the control plane. Missing browser
capability or runner infrastructure failure falls back to local capture in
`runner when available` mode with a visible note. `runner only` fails with an
actionable reason. Capture-plan failures retain local semantics: declared
missing targets fail UI verification/handoff, while automatic misses warn.
Partial or malformed artifact responses are treated as runner failures and
never replace existing evidence. Browser concurrency remains bounded by the
existing Playwright cap for local work and the runner's host slot limit for
remote work.

The initial Settings policy is `local`, `runner when available`, or `runner
only`; it defaults to `local` until runner images advertise WebKit and the
round-trip has passed a real end-to-end proof. Remote capture is unavailable
when remote validation is disabled. The implementation must not serialize
process environment or secrets into the request bundle.
