---
status: accepted
date: 2026-06-03
deciders: nick
---

# 0004 — Core stays minimal; project-specific integrations are plugins

## Status

Accepted.

## Context

RepoOS attracts a natural pull toward absorbing adjacent concerns: deployment
status, data dashboards, finance, accounting, and other integrations with
external systems. Each is individually reasonable and individually useful. The
question is whether they belong in core.

Two forces make this a real decision rather than a matter of taste:

- These concerns are PROJECT-SPECIFIC. A deployment panel matters to a repo
  that deploys; a finance integration matters to a repo where that's relevant.
  Most are irrelevant to most repos.
- These concerns require EXTERNAL DEPENDENCIES. Talking to Railway, Cloudflare,
  an accounting API, etc. means HTTP clients and vendor-specific code. RepoOS's
  core identity is zero runtime dependencies (ADR-relevant invariant). Putting
  these in core breaks that invariant directly.

So the boundary isn't only about avoiding bloat. The plugin boundary is also the
DEPENDENCY boundary and, for community-contributed extensions, the SECURITY
boundary. Drawing one line serves all three.

There is also a timing hazard. The common failure mode for plugin systems is
designing the extension API in the abstract, before any real extension exists,
guessing at extension points and getting them wrong — then being stuck
supporting a bad API or breaking every plugin to fix it.

## Decision

Core stays minimal, focused, and zero-runtime-dependency. Project-specific and
dependency-bearing integrations (deployments, data, finance, accounting, and
similar) are PLUGINS, not core features.

The plugin model has two tiers:

- **File-convention tier (the default, most plugins).** A plugin reads and
  writes files in the repo by documented conventions, and optionally contributes
  a UI panel and/or a CLI subcommand. It does NOT run with deep access to core
  internals. This tier exploits RepoOS's defining property — the repo is the
  interface. Because everything is already files, most integrations need no code
  API at all: they read the tasks/state they care about and write their own
  files where the UI can surface them. Low-coupling, language-agnostic,
  dependency-isolating.
- **Code-extension tier (rare, reluctantly granted).** A plugin that genuinely
  must run in-process and hook core behavior (a custom validator, a new mutation
  type, a parser extension). This needs a small, explicit, stable API and is
  where the risk concentrates. Kept deliberately small.

The plugin API is DISCOVERED, not designed up front. We build the first one or
two integrations in-tree, cleanly isolated behind interfaces (the Stage 4 deploy
panel is the first; `src/orchestrate/` is the same isolation instinct). The
plugin API is extracted only once real extensions reveal what they actually have
in common. We do not build the plugin system speculatively before having
plugins.

## Consequences

Costs we accept:

- Useful integrations live OUTSIDE core, so a user wanting deployments or
  finance must add a plugin rather than getting it built in. This is the point,
  but it is friction.
- We carry the discipline of building integrations in-tree first and resisting a
  premature abstraction — slower than designing an API up front, deliberately.
- A code-extension tier means community plugins can run code on a tool that sits
  on the user's source. This is a real security surface (a malicious or sloppy
  plugin could exfiltrate or corrupt repo data). It must be managed: prefer the
  file-convention tier, make code-extension explicit and opt-in, never auto-run
  untrusted plugins, and require a declarative manifest so capabilities are known
  without executing plugin code.

Positive:

- Core stays small, auditable, dependency-free, and easy to understand — the
  properties that make RepoOS what it is are protected BY the plugin boundary.
- Plugins own their own dependencies; the dependency boundary and the plugin
  boundary are the same line, so the ecosystem can be as heavy as it needs while
  core stays light.
- The repo-as-interface property means most plugins need little or no code API —
  the lowest-coupling, most durable, most community-friendly extension model
  available, and it falls out of the existing architecture for free.
- Plugin failure is contained: a plugin must degrade gracefully and must never
  crash core or corrupt task files (the "deploy panel hides without credentials"
  principle, generalized).

## Design principles (for when the API is extracted)

- Keep the exposed API surface SMALL and STABLE. Every internal exposed becomes
  a contract that can't be broken. Plugins build ON the file substrate, not INTO
  core internals.
- Plugins cannot break core. Failure is isolated and graceful.
- Zero-dependency core is preserved; plugins bundle their own dependencies.
- Plugins are declarative and discoverable via a manifest (name, panels/commands
  contributed, files/conventions used) — which is also the security surface.

## Related

- Protects the zero-runtime-dependency invariant (core architecture) by pushing
  dependency-bearing code outside core.
- The Stage 4 deploy panel and `src/orchestrate/` are the first plugin-shaped,
  in-tree isolations from which the plugin API should later be extracted.
- Plugin boundary = dependency boundary = security boundary.
