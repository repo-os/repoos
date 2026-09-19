# The polyglot adoption matrix (#0452)

RepoOS is developed on itself, which makes self-hosting the only *real* repo in
its test suite. That proves a Bun/TypeScript repository works; it cannot prove
that `repoos init`, the generated layout, `repoos check` plan inference or
worktree placement behave in a Go, Rust, Gradle/Kotlin or mixed repository — the
shapes a customer actually brings. The adoption matrix closes that gap with
minimal synthetic fixtures and a CI-visible suite, so a regression is found by a
named test rather than by a friend.

## What lives where

| Artifact | Purpose |
| --- | --- |
| `src/ui-app/tests/adoption/matrix.json` | The machine-readable manifest: one row per fixture with its stack, intent, declared toolchain and the plan it must infer. Adding a stack or changing an assumption is a diff here. |
| `src/ui-app/tests/adoption/fixtures.ts` | The synthetic project files, keyed by the same ids, plus the materializer. |
| `src/ui-app/tests/adoption/harness.ts` | Labels failures `[fixture=<id> phase=<phase>]`, and retains a redacted diagnostic JSON on failure. |
| `src/ui-app/tests/adoption-matrix.test.ts` | The fast, hermetic scenarios. |
| `src/ui-app/tests/adoption-matrix-toolchain.test.ts` | Toolchain-backed scenarios; self-skip when a binary is absent. |
| `src/ui-app/tests/adoption-doctor.test.ts` | The `repoos doctor` contract (#0451), activated when the command lands. |
| `.github/workflows/adoption-matrix.yml` | Runs the matrix on Linux and macOS, uploads diagnostics on failure. |

Fixtures are written to a temp directory at run time and never committed. A
checked-in `go.mod`/`Cargo.toml`/`gradlew`/`.ts` under `tests/` would be shaped
by RepoOS's own build, formatter and linter — exactly the wrong influence for a
fixture whose purpose is an *unfamiliar* project. The manifest guarantees they
contain no proprietary code, credentials, remote infrastructure or model
provider dependency.

## Fixtures

| id | Stack | Intent |
| --- | --- | --- |
| `ts-bun-web` | TypeScript web (Bun) | `fmt:check`/`lint`/`build`/`test` scripts + `bun.lock`; the lockfile selects Bun. |
| `ts-node-web` | TypeScript web (Node) | No `bun.lock`, so the inferred runner must be npm. |
| `go-service` | Go backend/service | `go.mod` with a `cmd/` entrypoint and a real package test. |
| `rust-cargo` | Rust/Cargo | A no-dependency crate with a library target and unit test. |
| `android-gradle` | Android/Kotlin/Gradle | Gradle settings/scripts, a wrapper, Kotlin sources and a test; inference must prefer the committed wrapper. |
| `vue-go-mixed` | Vue + Go (mixed) | One repo with a root Go module and root `package.json` + `bun.lock`; neither stack may drop the other. |
| `existing-agents-docs` | Existing AGENTS.md + docs | Already owns AGENTS.md and docs; init must never rewrite them. |
| `empty-repo` | New/empty repository | No markers at all; inference must yield an empty plan, never a vacuous green. |
| `existing-git-repo` | Existing Git repository | History, AGENTS.md and source; root detection and worktree placement paths. |

## Scenarios

For each fixture the hermetic suite exercises:

- **init/namespaced** — the default `repoos/` namespace: `repoos/work`,
  `repoos/docs`, a root `repoos.toml` and `AGENTS.md`, the cache gitignored.
- **init/root** — the reviewed alternate root layout (`work/`, `docs/`, no
  `workDir` override).
- **config/parse** — the generated `repoos.toml` round-trips through
  `loadConfig` to the selected layout.
- **agents/preserve** — existing `AGENTS.md` is byte-identical after init and
  any RepoOS appendix is optional and append-only; when absent, init creates it
  and points it at the actual layout.
- **plan/infer** — `resolveCheckPlan` produces exactly the manifest's expected
  steps, commands and `requires`. This reuses the #0446 check-plan schema and
  fixtures rather than defining a competing one.
- **plan/missing-tool** — with an empty `PATH`, a required step reports
  `missing-prereq` with install advice; it never reports a pass.
- **worktree/lifecycle** — a task worktree lands as a sibling of the Git root,
  carries the task file, checks out the branch, and is reused idempotently.

Path and root assumptions get their own cases: a repo path containing a space,
root resolution from a deeply nested directory, a reviewed alternate namespace
(`.meta/repoos`), and deterministic non-interactive re-runs.

## Tiers: hermetic vs toolchain-backed

The hermetic suite needs no toolchain, network, model provider or remote, so it
runs on every `bun run test`. The toolchain-backed suite actually runs the
fixture's commands when the binary exists, and self-skips with a one-line
report otherwise. Every fixture declares one of three tiers in the manifest:

- `local` — cheap to install and quick to run (Bun, npm, Go).
- `ci` — exercised in the routine CI job (Rust).
- `scheduled` — the heavy Gradle job, opt-in via `workflow_dispatch`/`schedule`
  and `REPOOS_ADOPTION_SCHEDULED=1` (Android/Kotlin/Gradle).

The Gradle fixture proves the project *shape* resolves (`./gradlew help`); a
full Android SDK build is out of scope for this matrix and is not promised.

## Diagnostics

On failure, `harness.ts` writes `<fixture>-<phase>.json` under
`REPOOS_ADOPTION_DIAGNOSTICS_DIR` (default: a temp directory) containing the
fixture id, phase, stack, intent, declared files and the redacted error. The
test name and the failure message both carry `[fixture=<id> phase=<phase>]`, so
a regression is attributable even from a truncated log. Redaction minimizes
absolute paths and stamps out secret-shaped text — belt-and-suspenders, since a
manifest test already proves the fixtures are secret-free.

## `repoos doctor` (#0451)

Doctor is a staged dependency. Until the command exists,
`adoption-doctor.test.ts` skips the contract suite and asserts this document
still records the dependency, so the gap stays visible. Once
`repoos doctor --json` lands, the same suite scaffolds every fixture and asserts
each finding carries a clean/warn/fail-style severity — the categories #0451
promises the UI and the support bundle.

## Platform coverage

The matrix runs on Linux and macOS. Path and process behaviour that differs
between them (symlinked temp directories, `/var` vs `/private/var`, package
managers) is covered by the path cases and by running the whole suite on both
in CI. **Windows is not claimed**: the suite does not run there and
`user-docs/` does not promise it.

## Adding a stack

1. Add a row to `matrix.json` with its intent and expected inferred plan.
2. Add its files to `FIXTURE_FILES` in `fixtures.ts`.
3. Run `bun run test adoption` — the manifest-integrity test fails until the
   fixture matches the plan the code actually infers.
4. Mention the id in this document; the integrity test checks the sync.

## Related

- `user-docs/check.md` — the user-facing check-plan documentation whose stack
  promises this matrix enforces.
- `docs/audits/2026-09-check-step-genericity-audit.md` — the audit behind the
  declarative plan (#0446) the matrix builds on.
