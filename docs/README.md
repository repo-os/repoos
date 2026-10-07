# docs — build context for RepoOS itself

Architecture, decisions, incident history and rationale for **building** RepoOS:
the context an agent or contributor needs before working on this codebase.
`AGENTS.md` points here, and agents are expected to read the relevant parts
before starting a task.

## This is a RepoOS convention, not just a folder

`repoos init` creates a docs directory (`config.docsDir`) in **every** repo
RepoOS manages — `repoos/docs/` under the default `repoos/` namespace, or
`docs/` at the root in the root layout — and scaffolds an `AGENTS.md` telling
agents to read it. In a repo running RepoOS, that directory holds *that*
project's build context. This repo is self-hosted and uses the root layout, so
here it holds RepoOS's own.

Write things down here when they would otherwise be re-derived, re-litigated or
re-broken on a future task: why a design went the way it did, what an incident
actually turned out to be, a constraint that isn't obvious from the code.

## Not to be confused with `../user-docs/`

| | Audience | Contents |
| --- | --- | --- |
| `docs/` (here) | People and agents **building** RepoOS | Architecture, ADRs, incident write-ups, rationale |
| `../user-docs/` | People **using** RepoOS | Install, task lifecycle, CLI, configuration — published to docs.repoos.org |

**Nothing in this directory is published to docs.repoos.org.** The two overlap
in subject matter but not in purpose, and they're expected to diverge. A note
here can assume deep familiarity with this codebase; a page in `user-docs/`
can't assume any.

## What's here

- `vision.md`, `concepts.md`, `roadmap.md` — what RepoOS is and where it's going.
- `onboarding.md` — what `repoos init` leaves on the board, why task 0001 is
  `done`, and how the starter task differs for a new project vs. an existing repo.
- `architecture.md`, `close-out-pipeline.md` — how the system is built, and the
  known close-out failure classes with the guards that exist for them.
- `field-reports/` — dated evidence from running RepoOS on real projects (what happened, error text, numbers, what to fix), with an index and a recipe for adding one. Start with the first agent-driven run (opex, 2026-10-05).
- `debugging-check-failures.md` — triage order for a `repoos check` failure you
  can't explain. Read before assuming "flake".
- `agent-run-operations.md` — driving a busy board (CLI control plane, false
  provider-failure kills #0709/#0718, remote slot starvation #0705, re-handoff
  and `commitDirty` rules). From the 2026-10-06 overnight triage (story #0008).
- `easter-eggs-bundles.md` — how to land many small, independent, low-risk fixes
  in one task (one worktree, one gate run, one review, one close-out) instead of
  one task each or a hotfix to `main`. #0721 is the worked example.
- `driver-notes.md` — the append-only lessons log for whoever is driving the
  board (the CTO, a human, or an external agent session). Read it when starting
  a shift; append to it instead of keeping lessons in private memory (#0731).
- `contrast-audit.md` — the rendered contrast gate (#0596): how every theme
  scope × light/dark is measured in headless WebKit, the judgment calls
  (gradient worst-stops, WCAG incidental exemptions, the config-load barrier),
  and what the first full triage changed in the product.
- `cto-autopilot.md` — the CTO's routine work (approval policy #0686, safe
  actions #0688, the #0727 restart strategy, the kill switch) and the
  conservative policy proposed for this repo. Read before touching
  `approval-policy`/`cto-actions` or enabling them in `repoos.toml`.
- `adr/` — Architecture Decision Records. Immutable once accepted: a changed
  decision gets a new ADR, not an edit.
- `native-auth.md`, `remote-validation.md`, `tunnel-registry.md`, `releases.md` —
  subsystem guides.
- `ai-chat-standards.md` — the contract every AI chat surface in the web UI
  obeys (scroll-to-newest, remembered position, jump-to-latest, pulsing working
  indicator). Read before adding or editing an AI chat.
- `previews.md` — how per-project preview targets work (`[preview]` config,
  area-based selection, the `repoos serve` fallback).
- `agent-model-recommendations.md`, `opencode-models.md`, `token-optimization.md`,
  `prompt-caching-audit.md` — agent and model operations.
- `agent-compatibility.md` — the versioned coding-harness compatibility
  contracts (#0466): manifest schema, status semantics, the adapter contract
  suite, credential/privacy boundaries, and the certification workflow.
- `dogfooding-vs-general.md` — which problems are artifacts of RepoOS running on
  itself versus real for every repo. Read this before generalizing from a
  dogfooding incident.
- `adoption-matrix.md` — the polyglot synthetic-fixture matrix that proves init,
  layout, check-plan inference and worktree behavior on Go, Rust, Gradle/Kotlin,
  mixed and existing-AGENTS.md repositories (#0452). Read before changing check
  inference or init scaffolding assumptions.
- `audits/`, `agents/` — point-in-time audits and raw agent reports.
