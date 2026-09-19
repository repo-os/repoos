# Built-in agents

[Agents](/agents) covers the lifecycle roles a task moves through — engineer,
reviewer, pm, and the rest. **Built-in agents** are the other kind: pre-built
specialists that audit your repo on demand or on a schedule and report what they
find. They live under **Build Your Team** on the Agents page.

They are not a task's lifecycle. Nothing routes a task through them, and they
never implement anything — they scan, and they hand you findings.

## How every built-in agent behaves

Every run produces exactly **two** things, whatever it found:

1. **A run doc** — the configured docs directory's `agent-runs/<agent>/<timestamp>.md`
   (`repoos/docs/agent-runs/…` on a fresh install), recording the agent,
   when it ran, how long it took, what it cost, and **every finding with its
   evidence** — including a run that found nothing, which is recorded as
   `ran clean`. The last 10 run docs per agent are kept; older ones are deleted
   on each new run. This is the receipt you read afterwards, so you never have to
   watch an agent run to know what it found.
2. **Zero or one inbox task** — never more than one per run. Every finding goes
   into that single task's body as a structured list, so a verbose scan can't
   flood your board. A run with no actionable findings files nothing. When a task
   needs your decision before anything can be implemented, it lands with
   `needs_input: true` and a `questions:` list in its frontmatter — answer them
   (or discuss them in the PM chat), remove them, and the task is ready to spec.
   If a run really did find more than one task's worth of work, the task body
   says so and asks you to create subtasks **once you've approved the direction**.

A finished run also announces itself: the UI toasts it — "Tech Debt Agent
finished — 3 findings" — whether you clicked **Run now** or it ran on schedule.

Each card on **Build Your Team** is configured independently:

- **Enable** — off by default. **Run now** stays disabled until you turn it on.
- **Coding agent + model** — its own CLI/model pair, separate from the lifecycle
  roles. Pick from the CLIs RepoOS detects on this machine.
- **Run schedule** — `Daily`, `Weekly`, or `Manual only` (the default). Daily
  runs once per calendar day; weekly runs once seven days have passed since the
  last run. `Manual only` runs solely when you click **Run now**.
- **Run now** — runs the agent immediately and reports what it did. While a run
  is in flight, another scheduled or manual run is refused rather than run
  concurrently.

The server checks schedules once a minute and starts at most one due agent per
tick. This state — enabled, schedule, last run — is kept in
the configured cache directory (`repoos/.repoos/built-in-agents.json` on a fresh
install), not `repoos.toml`; it's runtime state, like the
rest of the cache directory.

Each agent works from a deliberately bounded view of the repository and looks
for signal, not a full static analysis. Treat its output as a well-informed
first pass, not a verdict.

## Tech Debt agent

Scans your source for common debt patterns:

- **Outdated dependencies** — pre-release or wildcard version pins, plus a
  bounded comparison of exact/range pins against the npm registry (offline is
  never fatal).
- **Code duplication** — identical six-line blocks found in two or more files.
- **High-complexity files** — files longer than 500 lines.
- **Unused code** — exported identifiers no other file references.
- **Deprecated APIs** — `var` declarations.

**Good output:** at most one inbox task, `type: chore`, `area: tech-debt`, with
every finding's file, line, and severity listed in its body, plus the run doc
under the configured docs directory's `agent-runs/tech-debt/`. The task arrives with `needs_input: true`
because a scan's findings are a proposal, not a work order — answer its
questions, spec the ones worth doing, move it to `ready`, and let the normal
lifecycle take over. A run that finds nothing creates no tasks, but still writes
a `ran clean` run doc.

## Performance agent

Reviews your code for performance problems using its configured coding agent and
model. It works out what languages and entry points your repo actually uses
(manifests, lockfiles, layout) instead of assuming JavaScript, so a Python, Go,
Rust or Java project is reviewed on its own terms:

- **Blocking operations** — synchronous I/O on an async event loop, CPU-heavy
  work on a UI or request path, serial calls that should be batched.
- **Slow functions** — poor algorithmic complexity, repeated linear scans,
  expensive setup done on every call.
- **Unbounded growth** — caches, listeners or accumulators that are never
  evicted or unsubscribed.
- **Duplicated computation** — work recomputed inside a loop that could be
  hoisted, or the same payload parsed on every call.

**Good output:** at most one inbox task, `area: performance`, with every finding's
location and a plain-language description in its body, plus the run doc under
the configured docs directory's `agent-runs/performance/`. It lands with `needs_input: true` and its
questions, because which of these are worth optimizing — and to what threshold —
is your call. As with Tech Debt, an empty review files nothing but still writes
a `ran clean` run doc. If the configured model or CLI is unreachable, the run
fails with a message on the agent's own card instead of reporting a clean
result.

## Architect agent

Reviews the shape of the codebase rather than individual defects: tight coupling
(a file importing too many siblings), a pattern repeated across many files that
wants an abstraction, over-engineering, and large files that could become
scalability bottlenecks. It also notes the size of your top-level directories and
any architecture-flavoured tasks already on the board.

**Good output:** a timestamped run doc under

```
<configured-docs-dir>/agent-runs/architect/<ISO-timestamp>.md
```

plus at most one inbox task (`area: architecture`) carrying every finding with
its recommendation, marked `needs_input: true` — do you agree with the direction
these imply before any refactor starts? One task per run keeps a noisy scan from
flooding your inbox.

## Design agent

Reviews your web UI for quality and consistency — however it is built and
wherever it lives. It is **skill-guided**: the model reads a guidance doc
describing UI/UX review, then works out from your manifests and repo structure
whether you have a web UI at all and where its sources are — React, Vue,
Svelte, Angular, plain HTML/CSS/JS, and anything in between — rather than
assuming RepoOS's own framework or folder layout. It flags layout and rendering
bugs, styling that bypasses your design system, accessibility problems
(icon-only buttons, unlabelled inputs, keyboard-inaccessible controls), and
interaction-flow friction, and proposes concrete design improvements.

**Good output:** a timestamped run doc under

```
<configured-docs-dir>/agent-runs/design/<ISO-timestamp>.md
```

plus at most one inbox task (`area: design`) bundling every finding with its
rationale and suggested fix, marked `needs_input: true`. If your repo has no
detectable web UI, the run doc says so plainly — "no web UI detected" — rather
than reporting a misleading zero. A model or CLI failure surfaces on the agent's
own card, as with the other built-ins.

## Docs Debt agent

Checks that your documentation still tells the truth about the code. Like the
Performance and Design agents, it is **skill-guided**: the model reads a guidance doc
(`agents/skills/docs-debt.md` within the configured docs directory, when you
provide one) describing what documentation debt means, then verifies concrete,
checkable claims in `AGENTS.md` and your configured docs directory against the
actual repository. It finds where your code really
lives rather than assuming a language or layout, and it distinguishes claims
about *your* code from a doc's prose naming some third-party tool's own
convention — so it won't flag a formatter's config key or another agent's
parameter name as a missing symbol.

It fixes what it safely can, but never on its own say-so. A proposed fix is
applied and committed only when an independent, deterministic gate confirms
both halves against the files on disk: the doc still contains the exact text
being replaced, and the repo actually contains the replacement. Anything that
doesn't clear that gate — and any change that needs a judgment call — is left
alone for a human. Auto-applied fixes are capped at five per run.

**Good output:** usually the best kind — the docs already match the code, so
there's nothing to report (and the run still writes a `ran clean` run doc under
the configured docs directory's `agent-runs/docs-debt/`). When there are real findings, they're bundled into
a **single** inbox task (`area: docs-debt`), not one task per finding, each entry
naming the doc, line, evidence, and a suggested fix. That task lands with
`needs_input: true` — for each claim, should the doc change or the code? The run
banner also links straight to that task and lists any docs it corrected on its
own.

## Debugger

The Debugger is a built-in agent's neighbour but not one of the scanners: it's a
chat-only assistant. Paste a bug, stack trace, or error and it gives you a
diagnosis. It has no schedule and no **Run now** — you talk to it from its
floating head, next to Ross and the CTO.

## Where `repoos check` fits

Built-in agents don't run your tests, and their findings are advisory. The
checks that determine whether code is ready are separate — see [Checks before merge](/check) for
exactly what `repoos check` covers and what's opt-in per repo.
