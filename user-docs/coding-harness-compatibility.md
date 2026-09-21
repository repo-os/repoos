# Coding harness compatibility

Detection on `PATH` means only that RepoOS found a binary. It does not promise
that the adapter can safely drive that release. RepoOS keeps a small,
versioned contract for each drivable harness and checks the installed version
against the latest certified line.

## Statuses

- **Verified** — the release family is covered by a real RepoOS adapter
  contract suite and a recorded evidence source.
- **Upgrade recommended** — the installed release is older than the supported
  line. RepoOS still permits work when local capability checks pass.
- **Newer than verified** — the release is newer than RepoOS's last tracked
  certification. It is not blocked; review the release guidance before
  important work. RepoOS does not currently provide a live compatibility probe.
- **Unsupported** — a known incompatible family or a required local capability
  is missing.
- **Not yet probed** — RepoOS could not parse a version or has not yet
  validated that harness with an in-repo contract suite.

Compatibility is narrower than model quality, cost, or task success. A green
model-selection check is not certification of the complete adapter contract.

## Supported coding harness versions

| Harness | Supported major/range | Newest certified | Status and notes | Verified |
| --- | --- | --- | --- | --- |
| [OpenCode](https://opencode.ai/docs/) | v2 (`>=2.0.0 <3.0.0`) | 2.0.0 | OpenCode v2 is tracked in the manifest, but the in-repo adapter contract suite is still pending; do not treat it as certified until evidence is added. | Pending |

This table is derived from `src/core/agent-compatibility.json`; update that
manifest and add contract evidence together when certifying a release. Do not
silently widen a range because a newer binary happens to start.

## Probes, privacy, and upgrades

The default detector and `repoos doctor` are offline and token-free. They read
the local binary version and static contract metadata; they do not send version
telemetry or collect prompts and project code. A future live compatibility probe
must be explicitly started by the user, clearly warn that provider credentials
may be used, and run in an isolated temporary fixture/worktree that is cleaned
up afterward. No live probe is available in the current release.

Upgrade or roll back a harness using its official installer and then refresh
the Detected Coding Agents tab. Review the resulting status before assigning
important work. Keep the previous release available if a rollback is needed;
RepoOS never installs, upgrades, or changes a harness automatically.
