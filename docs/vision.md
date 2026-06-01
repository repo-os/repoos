# Vision

## The one-liner

**RepoOS — the repo is the operating system.**

## The shift we're building for

The constraint on building software has moved. It used to be headcount: more
features meant more engineers, more coordination, more process. With capable AI
agents, a handful of experts can now direct a swarm of agents and ship like a
team ten times their size.

But the tooling still assumes the old org chart. Tasks live in Linear, code in
GitHub, deploy state in another dashboard, and agent context in a scattered pile
of markdown files the agents can't reliably find. That stack was scaffolding for
coordinating *people*. When the workers are agents, most of it is dead weight —
and worse, it hides the work from the very agents doing it.

## What RepoOS is

RepoOS makes tasks, specs, and bugs into markdown files that live **in the
repo**, beside the code they describe. Status is a field in the file, not a card
in someone else's database. An agent reads a task the same way it reads source —
no integration, no API token, no glue. A human edits intent in a local UI; an
agent edits the same file from the command line; both changes show up live,
because underneath it's just the filesystem and git.

The repo stops being a place where code is stored and becomes the **control
plane** — the single surface where humans define direction and agents execute.

## The core bet

The friction that made "markdown as a task system" lose to Jira a decade ago was
*humans* hand-editing structured text. That friction is exactly what an LLM
erases. So the idea that was wrong in 2015 is right now: repo-native work objects
are versioned, branchable, reviewable, portable — and, critically, legible to the
agents doing the work.

## Who it's for

Small teams of exceptional builders — engineering, product, design, business —
who treat AI agents as a professional workforce rather than autocomplete. People
building world-class products with minimal headcount and minimal process. Not
hundred-person orgs with dedicated project managers translating intent into
tickets; the few-person team out-shipping the fifty-person one.

## What it is not

- Not a better Jira. Not project-management software with AI bolted on.
- Not a SaaS. It runs locally, your data never leaves your machine, no accounts,
  no lock-in.
- Not a business. It's MIT-licensed and free — built because the tool should
  exist, not because there's a company behind it.

## Principles

These are the commitments that shape every decision. They change rarely; when
one does, it's a strategic event worth an ADR.

1. **The repo is the source of truth.** Files and git, always. Everything else
   (indexes, caches, UI state) is derived and disposable.
2. **Agent-legible by default.** If an agent can't read it from the repo without
   an integration, it's in the wrong place.
3. **Humans set direction; agents execute.** The tool moves humans from
   data-entry to judgment, not out of the loop.
4. **Local-first, zero lock-in.** Works offline, owns nothing of yours, easy to
   adopt and easy to leave.
5. **Minimal ceremony.** One command to start. No process the team didn't ask
   for. The tooling earns its place by reducing friction, never adding it.

## How to read the rest of docs/

- **Why specific decisions were made** → `docs/adr/` (immutable decision
  records).
- **What we're building and in what order** → `docs/roadmap.md`, and `ros list`
  for live task status.
- **How the system is built right now** → `docs/architecture.md`.
