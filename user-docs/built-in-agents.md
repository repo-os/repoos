# Built-in agents

[Agents](/agents) covers the lifecycle roles a task moves through — engineer,
reviewer, pm, and the rest. **Built-in agents** are the other kind: pre-built
specialists that audit your repo on demand or on a schedule and report what they
find. They live under **Build Your Team** on the Agents page.

They are not a task's lifecycle. Nothing routes a task through them, and they
never implement anything — they scan, and they hand you findings.

## How every built-in agent behaves

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
`.repoos/built-in-agents.json`, not `repoos.toml`; it's runtime state, like the
rest of the cache directory.

Each scan is deliberately bounded and heuristic: it reads at most a few hundred
files, and it's looking for signal, not a full static analysis. Treat its output
as a well-informed first pass, not a verdict.

## Tech Debt agent

Scans your source for common debt patterns:

- **Outdated dependencies** — pre-release or wildcard version pins, plus a
  bounded comparison of exact/range pins against the npm registry (offline is
  never fatal).
- **Code duplication** — identical six-line blocks found in two or more files.
- **High-complexity files** — files longer than 500 lines.
- **Unused code** — exported identifiers no other file references.
- **Deprecated APIs** — `var` declarations.

**Good output:** one inbox task per issue type, `type: chore`, `area: tech-debt`,
with each finding's file, line, and severity in the body. Spec the ones worth
doing, move them to `ready`, and let the normal lifecycle take over. A run that
finds nothing creates no tasks.

## Performance agent

Scans for things that tend to get slow:

- **Slow functions** — files longer than 300 lines.
- **Blocking operations** — deeply nested loops, and synchronous file or
  serialization calls (`fs.readFileSync`, `fs.writeFileSync`, large
  `JSON.stringify`).
- **Unbounded growth** — heavy `.push()` / `Map` construction with no obvious
  cleanup.
- **Duplicated computation** — expensive calls made inside a loop.

**Good output:** inbox tasks grouped by issue type, `area: performance`, each
with the location and a plain-language description. As with Tech Debt, an empty
scan files nothing.

## Architect agent

Reviews the shape of the codebase rather than individual defects: tight coupling
(a file importing too many siblings), a pattern repeated across many files that
wants an abstraction, over-engineering, and large files that could become
scalability bottlenecks. It also notes the size of your top-level directories and
any architecture-flavoured tasks already on the board.

**Good output:** a timestamped markdown report under

```
docs/agents/Architect/Architect_report_<YYYY-MM-DD-HHMM>.md
```

This agent files **no tasks** — it writes the report and stops. Reading it and
creating tasks for what matters is your call, which keeps a noisy scan from
flooding your inbox.

## Design agent

Reviews the web UI for quality and consistency. It scans `src/ui-app/src/`
specifically, and flags things like hardcoded inline styles and hex colours that
bypass your theme, icon-only buttons with no accessible name, click handlers on
non-interactive elements, `v-html`, inputs with no label, and oversized
components.

**Good output:** a timestamped markdown report under

```
docs/agents/Design/Design_report_<YYYY-MM-DD-HHMM>.md
```

Like Architect, it files no tasks. If your repo has no `src/ui-app/src/`
directory, the report says so rather than guessing — the scan is scoped to the UI
layout RepoOS itself uses.

## Docs Debt agent

Checks that your documentation still tells the truth about the code. It reads
`AGENTS.md`, `docs/`, and `user-docs/` and verifies concrete, checkable claims:
that backticked repo paths exist, that camelCase symbols appear somewhere under
`src/`, that `bun run <script>` names exist in `package.json`, and that a
"zero runtime dependencies" claim matches the actual `dependencies`.

It fixes what it safely can. A stale path with exactly one obvious replacement is
replaced in place and committed with the evidence, capped at five such fixes per
run. Everything that needs a judgment call is left alone.

**Good output:** usually the best kind — the docs already match the code, so
there's nothing to report. When there are real findings, they're bundled into a
**single** inbox task (`area: docs-debt`), not one task per finding, each entry
naming the doc, line, evidence, and a suggested fix.

## Debugger

The Debugger is a built-in agent's neighbour but not one of the scanners: it's a
chat-only assistant. Paste a bug, stack trace, or error and it gives you a
diagnosis. It has no schedule and no **Run now** — you talk to it from its
floating head, next to Ross and the CTO.

## Where `repoos check` fits

Built-in agents don't run your tests, and their findings are advisory. The
checks that determine whether code is ready are separate — see [Checks before merge](/check) for
exactly what `repoos check` covers and what's opt-in per repo.
