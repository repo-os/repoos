# Coding-harness compatibility contracts (#0466)

How RepoOS decides whether an installed coding harness is safe to drive, what
"verified" means, how a release becomes certified, and how to add or upgrade a
harness. Read this before touching `src/core/agent-compatibility.ts`,
`src/core/agent-compatibility.json`, `src/core/agent-contract.ts`, the
compatibility UI in `AgentsView.vue`, or the user-docs page.

## The problem

Detection on `PATH` only proves a binary exists. It says nothing about whether
this release's CLI behavior still matches what the adapters in
`src/server/agents.ts` depend on (`run --format json` event shapes, resume
flags, permission flags, cancellation). Versioned compatibility contracts make
that an explicit, evidence-based claim instead of a hope.

## Pieces

- `src/core/agent-compatibility.json` — the source-controlled manifest (`schemaVersion`,
  `contracts[]`). Each contract records canonical `cli` id, `supportedMajor`,
  `supportedRange` (semver-ish), `newestCertifiedVersion` (null until a release
  is certified), `knownIncompatibleRanges`, `requiredCapabilities`, `verifiedAt`,
  `verificationSource`, `upgradeGuidance`, `officialUrl`.
- `src/core/agent-compatibility.ts` — loads the manifest and maps
  `(cli, installedVersion, drivable)` → a `CompatibilityStatus` + explanation.
  The loader is deliberately **non-throwing**: a build that predates the copy
  step degrades to an empty manifest (everything renders "not yet probed")
  rather than crashing the CLI/server at import time. `scripts/copy-assets.mjs`
  copies the JSON into `dist/` (tsc never emits JSON siblings); the
  `built dist artifact` test in `agent-compatibility.test.ts` fails the gate if
  that copy is missing.
- `src/core/agent-contract.ts` — the adapter contract suite: a probe per seam.
  Framework is generic; command templates start with OpenCode v2 and live in
  `CONTRACT_TEMPLATES`.
- `src/commands/doctor.ts` — wires the opt-in live probe as
  `repoos doctor --probe <cli> [--yes]`.
- UI: `AgentsView.vue` renders the status pill next to each detected harness;
  `doctor.ts` (`checkAgentCompatibility`) adds a doctor finding per enabled
  harness (verified→pass, unsupported→fail, otherwise warn — exit code flips
  when a finding is `fail`, same as every other doctor finding).

## Statuses

- **Verified** — installed release is inside `supportedRange` AND the manifest
  has `verifiedAt` + `verificationSource` (evidence). `verified` is
  *unreachable* until a maintainer deliberately records evidence — see
  certification below.
- **Upgrade recommended** — older than `supportedMajor`. Work still permitted
  if local capability checks pass.
- **Newer than verified** — newer than `newestCertifiedVersion`, once a
  certified baseline has been recorded, but not in a `knownIncompatibleRanges`
  family. Not blocked; guidance points at `repoos doctor --probe`.
- **Unsupported** — inside a `knownIncompatibleRanges` family, outside
  `supportedRange`, or a known-undrivable harness (e.g. `gemini`, `aider`).
- **Not yet probed** — no contract, version unparseable, or
  `supportedRange`-compatible but without certification evidence yet.

Advisory only: version never overrides the local capability checks the runner
actually does.

## The adapter contract suite

`runAdapterContract({ cli, bin?, mode, workDir? })` in `src/core/agent-contract.ts`
probes the seams RepoOS depends on, each against the binary in an isolated
temporary directory:

| Seam | What it proves | opencode v2 invocation |
| --- | --- | --- |
| version | `--version` parses to a real version | `--version` |
| help | `--help` prints usage text (flag shape) | `--help` |
| model-discovery | a model listing is available | `models` |
| headless-one-shot | a controlled run completes with an answer | `run --format json --dir <fixture> --auto <trivial prompt>` |
| structured-events | the `--format json` stream parses to known event shapes with a session id | (same run's stdout) |
| auto-permissions | the run accepts `--auto` and completes without a permission prompt | (same run) |
| session-continuation | a follow-up resumes the same session | `run --format json --dir <fixture> --session <id> --auto <prompt>` |
| cancellation | SIGTERM stops a run promptly | (a second run killed at ~300 ms) |

Two modes: **fixture** (deterministic, against a fake binary that exercises the
same argument shapes — what the test suite runs) and **live** (the same seats
against the real installed binary — `repoos doctor --probe`). The one-shot,
resume, and cancellation seams each start a real harness run in live mode, so
all three can consume provider tokens.

Where a seam's output is opencode-specific (`--format json` events), the
validator lives in the same module: `parseEventStream` /
`validateEventStream` / `extractSessionId`. They check *shape* (JSON lines,
known event types, session id presence) — the full transcript parser for the
real runner stays in `src/server/agents.ts` (`parseJsonEvent`); a probe is a
contract check, not a reimplementation.

## Credential / privacy boundaries

- Default detection (`detect.ts`) and plain `repoos doctor` are offline and
  token-free: they read `--version` and static manifest metadata, nothing else.
- The live probe (`repoos doctor --probe <cli>`) is **opt-in**: it prints an
  explicit warning that provider credentials may be used, confirms on a TTY
  (or requires `--yes` headless), runs only in a throwaway temp dir that may be
  pre-`git init`'d, uses a prompt that contains no task/project content
  ("Reply with the single word OK."), and removes the fixture afterwards.
- No telemetry, no version reporting, no background network calls.

## Certification and upgrade workflow (one documented path)

1. Install the exact release you want to certify.
2. Run `repoos doctor --probe <cli> --yes` in an isolated checkout and watch
   **all** seams pass.
3. Edit `src/core/agent-compatibility.json` in the same change:
   - bump `newestCertifiedVersion` (and `supportedRange` / `supportedMajor` if
     the line moved);
   - set `verifiedAt` (ISO date) and `verificationSource` (the probe command +
     result line, e.g. `repoos doctor --probe opencode --yes`, the installed
     version, date). Never set evidence without a real passing run — that is
     the "no undocumented optimistic version bump" rule.
4. Update the user-docs table row (the drift test
   `harness-compat-docs.test.ts` enforces the newest-certified + verified
   columns match the manifest).
5. Commit manifest + docs together with the probe evidence; `repoos check`
   passes before the change lands.

Adding a *harness*: add its command templates to `CONTRACT_TEMPLATES` in
`src/core/agent-contract.ts`, add a manifest entry (start with `verifiedAt:
null` — honest "pending"), and add fixture coverage in
`src/ui-app/tests/agent-contract.test.ts` that proves the argument shapes.
Contract fixtures must stay credential-free and deterministic; where a harness
cannot be tested in public CI, record the manual procedure and leave the
manifest entry pending.

## Worked example: OpenCode v2

Templates in `OPENCODE_CONTRACT` mirror `agents.ts`:
`run --format json --dir <dir> --auto <prompt>` for turns (the real runner also
appends `--model <model>` when one is configured, but the probe deliberately
omits it so certification does not depend on a chosen model),
`run --format json --dir <dir> --session <id>` for follow-up. The fixture
opencode in `agent-contract.test.ts` echoes `--auto`/`--session` shapes and a
four-event `--format json` stream. The manifest entry stays
`verifiedAt: null` until a maintainer runs the live probe and records the
evidence — "do not claim v2 support until it passes the implemented contract
suite."