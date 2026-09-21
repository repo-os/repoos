---
updated_at: "2026-09-21T14:36:49Z"
review_passes: 5
id: "0466"
title: Add versioned coding-harness compatibility contracts
type: feature
status: review
priority: p1
area: agent
assigned_to: ai
created_by: ""
branch: feat/add-versioned-coding-harness-compatibili
cli_override: github copilot
model_override: default
review_model_override: opencode-go/deepseek-v4.1-flash
created_at: "2026-09-21T09:13:33Z"
review_rounds: 2
handoff_signal_retry_count: 1
---
## Outcome

Make coding-agent compatibility an explicit, evidence-based RepoOS contract rather than an assumption made from a binary being present on PATH. Start with OpenCode v2, then make the same framework reusable for Codex, Claude Code, Cursor Agent, Copilot CLI, Antigravity, Kiro, Qwen Code, and future adapters.

RepoOS must support the current stable major release of each actively maintained harness without attempting an impractical full historical-version matrix. Users must be able to see whether their locally installed version is verified, merely old, newer than the last certification, or known incompatible before entrusting an important task to it.

## Product policy

For each drivable harness, maintain a small versioned compatibility contract with these statuses:

- **Verified** — the exact installed release, or a documented supported range, has passed RepoOS's adapter contract suite.
- **Upgrade recommended** — installed version is older than the supported major/version line. Do not promise full support; still permit work if local capability checks pass.
- **Newer than verified** — installed version is beyond the newest certified stable release. Do not block it solely for being newer; explain that it is unverified and offer a safe probe before important work.
- **Unsupported** — known breaking major/version family, or a required local capability is absent. Explain the exact recovery path.

Version is advisory, not the only decision-maker. A harness should be considered usable only when the relevant local capability checks pass; a version mismatch alone should not silently prevent a user from working.

## Scope

- [ ] Add a machine-readable, source-controlled compatibility manifest owned by the agent-adapter layer. Each entry records canonical CLI id, supported major/range, newest certified release, known-incompatible ranges where justified, required capabilities, verification date/source, and upgrade guidance.
- [ ] Begin with an OpenCode v2 entry. Treat the previous OpenCode major as legacy/upgrade-recommended unless its local probe proves the current adapter contract still works; do not claim v2 support until it passes the implemented contract suite.
- [ ] Define a minimal adapter contract that tests the actual seams RepoOS depends on, rather than attempting to run the whole product against many releases: binary/version detection, help/flag shape where reliable, model discovery, a controlled headless one-shot, structured output/event parsing, permission/auto mode, follow-up or session continuation, and cancellation/clean shutdown.
- [ ] Extend `repoos doctor` with strictly scoped, explicit compatibility findings. Its default remains read-only, offline, and token-free; it may report version status and static capability evidence. A live authenticated probe must be opt-in, clearly say that it may use provider tokens, run only in an isolated temporary fixture/worktree, and clean up after itself.
- [ ] Update the Agents UI to show the status next to each detected harness: verified, upgrade recommended, newer than verified, unsupported, or not yet probed. Include installed version, newest certified version, concise explanation, and a clear action such as upgrade, run probe, or view docs. Avoid treating a green model-selection probe as a performance or task-quality guarantee.
- [ ] Add deterministic fake-binary/fixture tests for adapters and parsers, plus a CI-visible contract job for each supported harness at its pinned certified release. Add a scheduled/latest-stable canary where credentials and licensing permit; a canary failure must be actionable and must not silently redefine support.
- [ ] Keep paid credentials, private prompts, task content, and user project code out of public CI. Where a harness cannot be tested in public CI, record the manual-certification procedure and show that limitation honestly in the manifest/docs.
- [ ] Provide a maintenance path: upgrading a certified release requires a deliberate manifest update plus contract evidence, not an undocumented optimistic version bump.

## Documentation requirements

- [ ] Add a user-docs page or clearly linked section explaining what compatibility status means, why RepoOS can show a newer version as unverified, what a live probe does, and how to safely upgrade/roll back a harness.
- [ ] Include a maintained, human-readable **Supported coding harness versions** table in user docs. At minimum: harness, supported major/range, newest certified version, status/notes, verification date, and link to official install/upgrade guidance. Make its data derive from or be checked against the machine-readable manifest so it cannot quietly drift.
- [ ] Update the Agents-page guidance and relevant configuration/reference docs to link to that table and to explain that detection on PATH does not itself guarantee full RepoOS support.
- [ ] Update internal developer documentation with the adapter contract, fixture strategy, credential/privacy boundaries, certification/release process, and instructions for adding or upgrading a harness. Include OpenCode v2 as the worked example.

## Non-goals

- Do not promise every historical release, every provider/model, or every project stack works with every harness.
- Do not automatically collect compatibility telemetry, send local version data to RepoOS, or make background network requests without explicit user action.
- Do not use the support table to recommend models for quality, cost, or performance; compatibility is a narrower claim.
- Do not block all newer releases by default. Prefer visible uncertainty plus a safe probe.

## Acceptance criteria

- A user with an old OpenCode release sees a concrete upgrade recommendation instead of a vague "detected" badge.
- A user with a release newer than the latest certification sees an unverified notice and can run a deliberate, understandable probe before starting important work.
- A supported version has test evidence for every CLI behavior RepoOS relies on, including structured output and follow-up/resume, not only `--version` or model listing.
- A developer can add a new agent adapter or certify a new stable version through one documented manifest-and-contract workflow.
- The user documentation contains an accurate supported-version table and explains the limits of the guarantee.
- `repoos check` passes.

## Dependencies and sequencing

Build on #0451 (`repoos doctor`) for findings/UI-safe diagnostics and #0083 for existing CLI/model compatibility probes. Reuse #0452's fixture discipline where useful, but keep harness contract testing separate from the polyglot project-adoption matrix. Coordinate with each harness adapter task rather than duplicating its invocation logic.

## Original prompt

Create a sustainable versioned coding-harness compatibility policy. Support the latest stable major versions, warn rather than silently fail for older versions, permit newer versions as explicitly unverified when local capability checks pass, and document supported versions for users and maintainers.

## Activity

- 2026-09-21T09:13:33Z · created · unknown
- 2026-09-21T10:47:13Z · cli_override, model_override
- 2026-09-21T10:47:27Z · review_model_override
- 2026-09-21T10:47:29Z · status inbox→ready
- 2026-09-21T10:47:31Z · status ready→active, branch
- 2026-09-21T11:04:51Z · status active→review
- 2026-09-21T11:06:02Z · status review→active
- 2026-09-21T11:52:32Z · status active→review
- 2026-09-21T11:53:39Z · status review→active
- 2026-09-21T12:00:11Z · status active→review
- 2026-09-21T14:02:54Z · status review→active
- 2026-09-21T14:04:04Z · status active→review
- 2026-09-21T14:27:01Z · status review→active
- 2026-09-21T14:27:03Z · status active→review

