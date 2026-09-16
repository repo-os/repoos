# docs — build context for RepoOS itself

Architecture, decisions, incident history and rationale for **building** RepoOS:
the context an agent or contributor needs before working on this codebase.
`AGENTS.md` points here, and agents are expected to read the relevant parts
before starting a task.

## This is a RepoOS convention, not just a folder

`repoos init` creates `docs/` (`config.docsDir`) in **every** repo RepoOS
manages, and scaffolds an `AGENTS.md` telling agents to read it. In a repo
running RepoOS, `docs/` holds *that* project's build context. This repo is
self-hosted, so here it holds RepoOS's own.

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
- `architecture.md`, `close-out-pipeline.md` — how the system is built, and the
  known close-out failure classes with the guards that exist for them.
- `debugging-check-failures.md` — triage order for a `repoos check` failure you
  can't explain. Read before assuming "flake".
- `adr/` — Architecture Decision Records. Immutable once accepted: a changed
  decision gets a new ADR, not an edit.
- `native-auth.md`, `remote-validation.md`, `tunnel-registry.md`, `releases.md` —
  subsystem guides.
- `previews.md` — how per-project preview targets work (`[preview]` config,
  area-based selection, the `repoos serve` fallback).
- `agent-model-recommendations.md`, `opencode-models.md`, `token-optimization.md`,
  `prompt-caching-audit.md` — agent and model operations.
- `dogfooding-vs-general.md` — which problems are artifacts of RepoOS running on
  itself versus real for every repo. Read this before generalizing from a
  dogfooding incident.
- `audits/`, `agents/` — point-in-time audits and raw agent reports.
