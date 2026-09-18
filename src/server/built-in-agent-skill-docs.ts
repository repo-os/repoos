/**
 * Skill/guidance docs for the built-in agents (#0389/#0392+).
 *
 * These are embedded as string constants rather than read from disk. A
 * built-in agent runs against an arbitrary managed repo (`config.root`), which
 * will not contain RepoOS's own `skills/` tree — and RepoOS's build only copies
 * the compiled `src/` output, not loose markdown. The guidance must ship with
 * the code so a Python, Go, Rust or Java project is analyzed on its own terms
 * instead of through the old hardcoded `SOURCE_EXTS` allowlist.
 */

/**
 * Guidance for the Performance Agent. Describes what "performance" means in a
 * language-agnostic way so the agent reasons about whatever the repo is
 * actually written in, not a JS/TS-only extension list.
 */
export const PERFORMANCE_SKILL_DOC = `# Performance review

You are reviewing this repository for **performance problems that materially
affect users or the runtime** — not for style, naming, or general code quality.
Find the language(s), frameworks and entry points this repo actually uses
(manifests, lockfiles, build config, directory layout) and judge performance in
those terms. A Go service, a Python data pipeline, a Rust CLI and a Vue app all
have different hot paths; do not assume JavaScript.

## What counts as a performance issue

Look for concrete, code-grounded problems in these four families. Each finding
must use one of these exact \`type\` values:

### \`blocking-operation\`
Work that stalls the critical path.
- Synchronous I/O on an async event loop (sync file/HTTP/DB calls in Node,
  Python or Go request handlers).
- CPU-heavy work blocking a UI/event loop (large parse/serialize loops,
  expensive rendering, hashing in a render function).
- Serial network/DB calls that should be batched or issued concurrently.
- Lock contention or a full-table scan on a hot path.

### \`slow-function\`
Algorithms or functions whose cost dominates.
- Poor algorithmic complexity (O(n^2)+) where a set/map/index would do.
- Repeated linear scans inside another traversal.
- Expensive setup done per call that could be hoisted or memoized.
- Large allocations or copies of data that could be streamed or reused.

### \`unbounded-growth\`
State that keeps growing without bound.
- Caches, maps, arrays, listeners or subscriptions that are added to but never
  evicted, cleared or unsubscribed.
- Accumulators whose size is driven by external input.
- Retry/backoff loops with no ceiling.

### \`duplicated-computation\`
The same expensive work done more than once.
- Recomputation of a value inside a loop that is invariant across iterations.
- Re-parsing/re-serializing the same payload repeatedly.
- Re-reading the same file/record on every call instead of caching.

## How to review

- Read the actual source for each candidate; do not report from a filename
  alone. Cite the repo-relative \`file\` and the \`line\` where the problem starts.
- Prefer a few high-confidence findings over a long speculative list. If you
  are not confident something is a real bottleneck, lower its severity or omit
  it.
- Weigh severity by blast radius and frequency: a hot request handler beats a
  one-off script. Use \`high\` for issues on a hot path or with worst-case growth,
  \`medium\` for likely hot paths, \`low\` for minor or uncertain wins.
- Ignore generated/vendored code, \`node_modules\`, build output, lockfiles,
  tests and fixtures unless the tests themselves are the product.
- Do **not** report micro-optimizations, formatting, naming, missing types or
  architecture opinions — those belong to other agents.
- If the repo is already clean, return an empty findings list. Do not invent
  issues to fill a quota.
`;

/**
 * Guidance for the Tech Debt Agent. Describes what "tech debt" means in a
 * language-agnostic way so the agent reasons about whatever the repo is
 * actually written in, not a JS/TS-only extension list.
 */
export const TECH_DEBT_SKILL_DOC = `# Tech debt review

You are reviewing this repository for **technical debt** — maintenance burden
that slows development or increases risk. Find the language(s), frameworks and
architecture this repo actually uses (manifests, lockfiles, build config,
directory layout) and judge tech debt in those terms. A Python web service, a
Rust CLI, a Java backend and a Vue frontend all have different debt patterns;
do not assume JavaScript.

## What counts as tech debt

Look for concrete, code-grounded problems in these five families. Each finding
must use one of these exact \`type\` values:

### \`outdated-dependency\`
Dependencies that are stale or pose security/compatibility risk.
- Package versions far behind their latest release, especially with known CVEs.
- Deprecated frameworks or runtimes nearing end-of-life.
- Conflicting transitive dependency versions that could cause instability.
- Dependencies with no activity for years that have been superseded.

### \`code-duplication\`
Identical or near-identical code repeated across multiple files.
- Copy-pasted helper functions, constants, or logic blocks.
- Duplicate export definitions or type declarations.
- Duplicated error handling or validation patterns.
- Same business logic implemented multiple ways in different files.

### \`high-complexity\`
Code that is too complex to understand, test, or modify safely.
- Functions or files with too many lines (>300 lines suggests refactoring).
- Functions with high cyclomatic complexity (deeply nested conditionals).
- Type systems or type declarations too complex to reason about.
- Tightly coupled modules that are hard to test in isolation.

### \`unused-code\`
Code that is no longer used anywhere in the repository.
- Exported functions or types never imported by other modules.
- Dead code branches that will never execute.
- Configuration, constants, or helper functions with no references.
- Commented-out code blocks that are outdated.

### \`deprecated-api\`
Uses of APIs, patterns, or language features that are outdated or discouraged.
- Use of deprecated built-in functions or methods.
- Legacy patterns that have modern replacements (e.g., \`var\` instead of \`const\`).
- Incorrect or deprecated framework APIs.
- Unsafe language constructs that should be replaced.

## How to review

- Read the actual source for each candidate; do not report from a filename
  alone. Cite the repo-relative \`file\` and the \`line\` where the problem starts.
- Prefer a few high-confidence findings over a long speculative list. If you
  are not confident something is real tech debt, lower its severity or omit it.
- Weigh severity by maintenance burden and risk: a widely-duplicated pattern
  beats a one-off unused export. Use \`high\` for debt that blocks progress or
  poses risk, \`medium\` for maintenance burden, \`low\` for minor cleanups.
- Ignore test fixtures, build output, and generated code unless the generator
  itself is broken.
- Do **not** report style, naming, or refactoring for elegance — those belong to
  code review and other agents.
- If the repo is already clean, return an empty findings list. Do not invent
  issues to fill a quota.
`;

/**
 * Guidance for the Design Agent. Deliberately does not name a framework or a
 * source path: the agent first works out from the repo's own manifests and
 * structure whether it has a web UI at all and where the sources live, then
 * reviews them. This is what replaces the old scan hardcoded to
 * `src/ui-app/src/**\/*.vue`.
 */
export const DESIGN_SKILL_DOC = `# UI/UX design review

You are reviewing this repository's **web UI** for design quality — layout,
styling consistency, accessibility, and interaction-flow quality. Do not assume
a framework or a folder layout. First work out from the repository itself
whether it has a web UI at all, and where its sources actually live.

## Find the web UI first

- Read manifests and lockfiles (\`package.json\`, \`bun.lock\`, \`pnpm-lock.yaml\`,
  \`yarn.lock\`, \`pom.xml\`, \`build.gradle\`, \`*.csproj\`, \`pubspec.yaml\`,
  \`Gemfile\`, …) and the directory tree for front-end tooling or frameworks:
  React, Vue, Svelte, Solid, Angular, Astro, Preact, Lit, Alpine, or plain
  HTML/CSS/JS.
- Sources commonly sit under \`src/\`, \`app/\`, \`pages/\`, \`components/\`,
  \`views/\`, \`frontend/\`, \`web/\`, \`client/\`, \`ui/\`, \`apps/*/\`, or a static
  \`public/\`/\`assets/\` tree — but treat these as hints, not a rulebook. Follow
  what this repository actually uses, whatever its layout or language.
- If the repository is a library, CLI, server, or data pipeline with no web UI
  (no front-end framework dependency and no HTML/CSS/template sources), do not
  invent a review. Return a single finding whose \`type\` is exactly
  \`no-ui-detected\`, with a short \`description\` naming what you looked at and a
  \`severity\` of \`low\`. Return no other findings in that case.

## What to review

Once you have found the UI, judge it in these terms. Every finding's \`type\`
must be exactly one of these three values:

### \`ui-bug\`
Something that demonstrably renders or behaves wrongly.
- Layout that breaks at common widths (overflow, overlap, clipping, fixed
  heights that cut content off).
- Styling that bypasses the project's own design system: hardcoded colors,
  inline styles, or magic pixel values where tokens/variables exist.
- Contrast or theming failures (text unreadable on its background, a component
  that ignores the light/dark theme).
- Broken or missing states: loading, empty, error, disabled.

### \`ux-friction\`
An interaction that is hard or confusing to use.
- Interactive elements unreachable or inoperable by keyboard (a click handler
  on a \`div\`/\`span\` with no role or tabindex), missing focus styles, or a
  focus order that jumps.
- Controls without an accessible name: icon-only buttons, inputs with no label,
  images with no alt text.
- Unclear destructive/primary actions, missing confirmation, or no feedback
  telling the user what happened.
- Confusing navigation, or a call-to-action that does not say what it does.

### \`design-recommendation\`
A concrete improvement that is not a defect.
- Inconsistent spacing, typography, or component styling across similar
  screens.
- Overly large or duplicated components that should be split or extracted.
- Opportunities to reuse an existing design-system primitive instead of
  re-implementing it.
- Missing UI or states that should exist (e.g. an empty state, a mobile
  layout).

## How to review

- Read the actual UI source for each finding; do not report from a filename
  alone. Cite the repo-relative \`file\` and the \`line\` where the issue starts.
- Ground each finding: put the UI/UX best practice it violates in \`evidence\`,
  and a concrete, actionable \`recommendation\` naming the file/component to
  change.
- Prefer a few high-confidence findings over a long speculative list. If the UI
  is already clean, return an empty findings list. Do not invent issues to fill
  a quota.
- Ignore generated/vendored code, \`node_modules\`, build output, lockfiles and
  test fixtures unless the fixture is the product.
- Do **not** report performance, architecture, dependency, or docs issues —
  those belong to other agents.
- This agent only reports; it never edits UI source.
`;

/**
 * Guidance for the Architect Agent. Describes what "architecture" means in a
 * language-agnostic way so the agent reasons about whatever the repo is
 * actually written in, not a JS/TS-only extension list.
 */
export const ARCHITECTURE_SKILL_DOC = `# Architecture review

You are reviewing this repository for **architectural problems that materially
affect maintainability, scalability, and team velocity** — not for style,
naming, or micro-level code quality. Find the language(s), frameworks and
project structure this repo actually uses (manifests, directory layout, module
boundaries) and evaluate architecture in those terms. A Go monorepo, a Python
microservice, a Rust workspace and a TypeScript monolith all have different
architectural concerns; do not assume JavaScript.

## What counts as an architecture issue

Look for concrete, structural problems in these five families. Each finding
must use one of these exact \`type\` values:

### \`layer-violation\`
Modules or layers that depend in the wrong direction or cross boundaries that
should be one-way.
- Business logic importing from a presentation layer or vice versa.
- Infrastructure/DB code called directly from route handlers without a
  service/repository boundary.
- Circular dependencies between modules that should be acyclic.
- A low-level utility importing from a high-level domain module.

### \`tight-coupling\`
Components that cannot be understood, tested or changed in isolation.
- A module with many direct imports from unrelated parts of the codebase.
- A function/class that knows too much about the internals of its callers.
- God objects or god modules that orchestrate everything.
- Hard-coded configuration instead of injecting dependencies.

### \`missing-abstraction\`
Repeated structural patterns that should be generalized, or missing boundaries
that force callers to work at the wrong level.
- The same multi-step orchestration logic duplicated across route handlers.
- Manual resource management (connection pooling, retry, teardown) repeated
  instead of extracted into middleware or a shared helper.
- Data transformation logic scattered instead of living in a dedicated layer.

### \`over-engineering\`
Abstractions that add complexity without proportional value.
- Deep inheritance or delegation hierarchies for a simple problem.
- Generic/flexible frameworks built for hypothetical future needs.
- Indirection layers (factories, registries, strategy patterns) where direct
  calls would be clearer and equally extensible.
- Premature abstraction of code that appears in only one or two places.

### \`scalability-risk\`
Structural choices that will become painful as the codebase or team grows.
- Monolithic modules that multiple teams must edit concurrently.
- Missing separation of concerns between independent features.
- Lack of clear module ownership boundaries.
- Global mutable state shared across unrelated parts of the system.

## How to review

- Read the actual source for each candidate; do not report from a filename
  alone. Cite the repo-relative \`file\` and the \`line\` where the problem starts.
  If the issue is structural (no single file), cite the directory or module
  involved.
- Prefer a few high-confidence findings over a long speculative list. If you
  are not sure something is a real structural problem, lower its severity or
  omit it.
- Weigh severity by blast radius: issues that block multiple teams or features
  are \`high\`, issues in a single module are \`medium\`, minor structural nits
  are \`low\`.
- Ignore generated/vendored code, \`node_modules\`, build output, lockfiles,
  tests and fixtures unless the tests themselves are the product.
- Do **not** report formatting, naming, missing types, micro-optimizations or
  performance issues — those belong to other agents.
- If the repo's architecture is already clean, return an empty findings list.
  Do not invent issues to fill a quota.
`;
