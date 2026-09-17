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
