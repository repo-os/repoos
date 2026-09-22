# Coding harness compatibility

Detection on `PATH` means only that RepoOS found a binary. It does not promise
that the adapter can safely drive that release. RepoOS keeps a small,
versioned contract for each drivable harness and checks the installed version
against its supported line and any recorded certification.

## Statuses

- **Verified** — the release family is covered by a real RepoOS adapter
  contract suite and a recorded evidence source.
- **Upgrade recommended** — the installed release is older than the supported
  line. RepoOS still permits work when local capability checks pass.
- **Newer than verified** — the release is newer than RepoOS's last tracked
  certification. It is not blocked; run a compatibility probe before important
  work — see [Probes, privacy, and upgrades](#probes-privacy-and-upgrades).
- **Unsupported** — a known incompatible family or a required local capability
  is missing.
- **Not yet probed** — RepoOS could not parse a version or has not yet
  validated that harness with an in-repo contract suite.

Compatibility is narrower than model quality, cost, or task success. A green
model-selection check is not certification of the complete adapter contract.

## Supported coding harness versions

| Harness | CLI id | Binary | Supported range | Newest certified | Notes |
| --- | --- | --- | --- | --- | --- |
| **OpenCode** | `opencode` | `opencode` | `>=2.0.0 <3.0.0` | **2.0.11** (2026-09-22) | Full 8-seam certification. Use `--standalone` for isolated probes. |
| **Claude Code** | `claude code` | `claude` | `>=2.0.0 <3.0.0` | Pending | Contract templates ready; run `repoos certify "claude code" --yes` to certify. |
| **Qwen Code** | `qwen code` | `qwen` | `>=0.1.0 <1.0.0` | Pending | Claude-compatible interface; `--yolo` used for headless approval bypass. |
| **Codex** | `codex` | `codex` | `>=0.100.0 <1.0.0` | Pending | Uses `codex exec --json` with workspace-write sandbox. |
| **Cursor Agent** | `cursor` | `cursor-agent` | `>=2026.0.0 <2027.0.0` | Pending | Stream-json mode; `-f/--force` bypasses approval prompts. |
| **Kiro** | `kiro` | `kiro-cli` | `>=2.0.0 <3.0.0` | Pending | Plain-text output mode; session-continuation uses `--resume-id`. |
| **Antigravity** | `antigravity` | `agy` | `>=1.0.0 <2.0.0` | Pending | Gemini-backed; `--dangerously-skip-permissions` for unattended work. |

This table reflects `src/core/agent-compatibility.json`. Update that manifest
and add contract evidence together when certifying a release. Do not silently
widen a range because a newer binary happens to start.

## Probes, privacy, and upgrades

The default detector and `repoos doctor` are offline and token-free. They read
the local binary version and static contract metadata; they do not send version
telemetry or collect prompts and project code.

### Running a live probe

A live compatibility probe is available on request and is opt-in:

```
repoos doctor --probe opencode --yes
```

This runs the harness's adapter-contract suite inside an isolated temporary
directory, exercising eight seams: version detection, help/flag shape, model
discovery, a headless one-shot, structured event parsing, permission/auto mode,
session continuation, and cancellation. The one-shot, resume, and cancellation
seams each start a real harness run, so the probe **may consume provider
tokens**. The command warns clearly about this, asks for confirmation when you
are at a terminal (pass `--yes` to skip the prompt), and cleans up the fixture
when it finishes.

Run a probe when:

- the Agents page marks your installed harness **newer than verified** and you
  want to start important work with it, or
- you are a maintainer certifying a release — see below.

### `--binary` override

Both `repoos doctor --probe` and `repoos certify` accept `--binary <path>` to
probe a specific binary instead of resolving from `PATH`:

```
repoos doctor --probe opencode --binary ~/.opencode/bin/opencode --yes
repoos certify opencode --binary ~/.opencode/bin/opencode --yes
```

This is useful when you have multiple versions installed or the binary is not
on `PATH` under the expected name.

### Shared machine-wide detect cache

The detected binary and version information is currently per-project (stored in
the RepoOS server's in-memory state and refreshed on page load). There is no
cross-project shared cache for detection results, but compatibility _contract_
data (`src/core/agent-compatibility.json`) ships with RepoOS itself — every
project using the same RepoOS version sees the same certification status without
re-running probes.

## Certifying a release (maintainers)

`repoos certify` runs the probe and, when every seam passes, writes the
certification evidence back into `src/core/agent-compatibility.json`
automatically. This is the maintainer path from "probe passed" to "all users
see verified."

```
# Full probe + manifest write in one step:
repoos certify opencode --yes

# Probe a specific binary path:
repoos certify "claude code" --binary /usr/local/bin/claude --yes

# JSON output (for CI / scripting):
repoos certify opencode --yes --json
```

When certify passes all seams it:

1. Updates `newestCertifiedVersion`, `verifiedAt`, and `verificationSource` in
   the manifest.
2. Prints the path of the updated file and suggests the commit command.
3. Exits 0.

When any seam fails the manifest is **not** updated and the command exits 1.

### Weekly CI certification

A GitHub Actions workflow (`.github/workflows/certify-harnesses.yml`) runs
`repoos certify` weekly for headlessly-installable harnesses (opencode,
claude-code, codex). It requires the corresponding API key secrets
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) to be configured in the repository.
When all seams pass it opens a pull request with the updated manifest. This
keeps the shipped compatibility data current automatically.

### What each seam checks

| Seam | What passes |
| --- | --- |
| `version` | `--version` exits 0 and prints a parseable semver triple |
| `help` | `--help` exits 0 and prints usage text containing `run`, `usage`, `options`, or `command` |
| `model-discovery` | `models` subcommand exits 0 (no output is fine for server-backed CLIs) |
| `headless-one-shot` | A one-shot run completes, exits 0, and the output contains a recognizable answer |
| `structured-events` | The output contains at least one recognized event/line in the CLI's structured format |
| `auto-permissions` | The run used a permission-bypass flag (`--auto`, `--dangerously-skip-permissions`, `--yolo`, `-f`, etc.) and completed |
| `session-continuation` | A session ID was captured from the first run and a `--resume` follow-up completed |
| `cancellation` | A run starts and exits cleanly after SIGTERM |

### Adding a new harness

To add contract templates for a new harness:

1. Add the harness to `KNOWN_AGENTS` in `src/core/detect.ts` (cli, binary, etc.).
2. Add a `ContractCommandTemplates` entry in `src/core/agent-contract.ts`:
   - `version()`, `help()`, `models()` (return `null` when no listing command exists)
   - `run(dir, prompt)`, `resume(dir, sessionId, prompt)` — use the exact flags the driver uses
   - `parseRun(stdout)` — extract `sessionId`, `hasAnswer`, recognized event count
3. Register it in `CONTRACT_TEMPLATES`.
4. Add a stub entry in `src/core/agent-compatibility.json` with `newestCertifiedVersion: null`.
5. Run `repoos certify <cli> --yes` and commit the updated manifest.

RepoOS never installs, upgrades, or changes a harness automatically. Upgrade or
roll back a harness using its official installer and then refresh the Detected
Coding Agents tab. Keep the previous release available if a rollback is needed.
