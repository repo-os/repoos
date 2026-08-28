# Prompt-caching audit — Phase 1 (static analysis)

RepoOS never calls an LLM API directly for agent work; it builds a prompt
string (the "mission") and hands it to a coding-agent CLI (`claude`, `codex`,
`opencode`, `qwen`, `copilot`, `kiro`), which wraps it in its own system prompt
+ tool definitions and makes the API call with its own cache breakpoints.

So RepoOS cannot set `cache_control`. What it controls — and what this audit
covers — is **the text it injects and the order it injects it in**, which
decides whether the CLI's caching (explicit on Anthropic, automatic on OpenAI /
DeepInfra) can get a hit.

Phase 0 (`de2d529d`) added per-session `cacheReadTokens` / `cacheCreationTokens`
capture. Phase 1 (this doc) identifies what to change. Phase 2 applies the
byte-level fixes. Phase 3 is the oracle-call rework.

---

## TL;DR — three findings, in priority order

| # | Finding | Fix | Effort |
|---|---|---|---|
| 1 | `runner.start` re-renders and re-sends the **whole context pack** as a *fresh* CLI conversation on every task activation; the mission is ordered **volatile-first**, so no prefix cache can survive | Reorder `missionFor` + `renderPack` stable-first; freeze a byte-identical prefix | Medium |
| 2 | Ross (RepoOS Guide) and the Debugger re-inject the **entire board** (~35 KB at 290 tasks) as a preamble on **every** message; snapshots pile up stale in the transcript | Send board context once per session; on resume send a **delta**, not a re-dump | Medium |
| 3 | Every "oracle" call (CTO monitor, done-guard, review-triage, classification) is a **fresh `runPrompt` process** — no session, no `--resume`, no caching possible — that pays full price for a large prompt to get a short answer | Direct cached API call behind a provider-neutral seam | Medium-high |

**Blocking caveat:** we do not yet know whether the models RepoOS runs actually
support prompt caching. `engineer`/`pm` currently run
`deepinfra/Qwen/Qwen3-Coder-480B` and `deepinfra/DeepSeek-V4-Flash` via
opencode's OpenAI-compatible endpoint. DeepInfra's caching is model-specific.
If those models don't cache, findings 1 and 2 are moot for those roles (they
still help the claude-code `reviewer`). **Phase 0's `cacheReadTokens` will show
this within a few real task runs** — if it's `0` / `null` for opencode
sessions, reprioritise.

---

## How prompts are assembled

### Engineer — `missionFor()` (`src/server/agents.ts`)

```
[ contextPack ]          ← generateContextPack(), see below
[ resumePreamble ]       ← dirty-worktree summary, or Ross/Debugger board dump
[ agent.instructions ]   ← stable per agent
[ fail-safe checklist ]  ← ~2 KB, 100% static
[ preview / serve boilerplate ] ← ~1 KB, 100% static
```

The two big **static** blocks (checklist + preview boilerplate) are **last**.
Everything cacheable is behind everything volatile.

### `generateContextPack()` → `renderPack()` (`src/core/context-pack.ts`)

Section order as emitted:

| # | Section | Stability |
|---|---|---|
| 1 | Task meta (id/title/area/type/priority) + `**Cache:** miss` | stable per task |
| 2 | **### Task Specification** (task body, ≤3 KB) | stable per task |
| 3 | **### Worktree State** (dirty flag, untracked list, **dirty diff summary**) | **changes every turn** |
| 4 | ### Applicable Constraints (AGENTS.md, ≤2 KB) | stable per repo |
| 5 | ### Likely Implementation Files (ranked, budget derived from running size) | mostly stable, position-sensitive |
| 6 | ### Verification Commands | static |
| 7 | ### Managed Preview | static |
| 8 | **### Bootstrap Telemetry** (per-step `durationMs`) | **changes every run** |
| 9 | ### Git Workflow | static |

Sections 4–9 are ~6–8 KB of stable-or-static content sitting **after** the
volatile Worktree State (section 3). The context pack is cached internally
(`contextCachePath`, keyed on HEAD + worktree state) — but that saves
*generation time*, not *tokens*: the full pack is re-sent to the model on every
`runner.start`.

### `runner.start` vs `runner.send`

- **`runner.start`** (`agents.ts:2632`) — always `cliCommand()` (a *fresh*
  `claude -p` / `codex exec` / `opencode run`), never `--resume`. Rebuilds the
  full mission incl. context pack. Fires on: task → active, re-activate after
  pause / needs-input, **review bounce → active**. A task's lifecycle
  (work → review → bounce → fix → review → done) hits this several times.
- **`runner.send`** (`agents.ts:2760`) — `resumeCommand()` (`claude --continue`
  etc.), resumes the CLI conversation. Only prepends `resumePreamble` +
  the user text. This path is cache-friendly today (preamble is *appended*,
  not inserted mid-prefix).

So the caching problem is concentrated in **`runner.start`**: a fresh CLI
conversation each time, re-sending a volatile-first mission.

### Ross / Debugger — `sendChatMessage` (`routes/info.ts`, `routes/debugger.ts`)

```js
runner.send(sessionId, text, agent, {
  resumePreamble: `Updated repository context:\n${repoGuideContext(config, index.getTasks())}`,
})
```

`repoGuideContext` renders **every task** as a one-liner —
`~290 lines × ~120 chars ≈ 35 KB` — and it changes every time a status shifts.
Every message prepends a fresh copy; the previous copy freezes into the
transcript. A 10-turn Ross chat carries ~350 KB of board snapshots, 9 of them
stale.

### CTO / oracle calls

`cto.ts` uses `runPrompt(agent, ctoMission(config, agent, boardDigest), …)` —
**one-shot, fresh process, no session**. Every monitor cycle re-sends the full
board digest + system prompt for a short verdict. Same shape for done-guard,
review-triage, and any classification call routed through `runPrompt` /
`recordOneShotSession`.

---

## Findings in detail

### Finding 1 — volatile-first mission defeats prefix caching

**What breaks:** On Anthropic the CLI puts a `cache_control` breakpoint after
the system prompt + tools and a rolling one near the end of the messages. On
OpenAI/DeepInfra the whole prefix is auto-cached up to the first byte that
differs from a previous request. In both cases, a **byte-identical prefix** is
required. RepoOS's mission leads with the context pack, whose section 3
(Worktree State) changes every turn — so on the *second* `runner.start` for a
task, the prefix diverges at section 3 and nothing after it can be a cache hit.
The ~8 KB of static checklist/boilerplate at the tail is re-processed from
scratch every activation.

**Fix (Phase 2):** reorder so the mission is:

```
1. agent.instructions                    (stable per agent)
2. fail-safe checklist + preview boilerplate  (100% static — move to the front)
3. AGENTS.md constraints                  (stable per repo)
4. Git Workflow / Verification Commands   (static)
5. Task Specification + task meta         (stable per task)
6. Likely Implementation Files            (stable per repo state)
--- cache breakpoint conceptually here ---
7. Worktree State + dirty diff            (volatile)
8. Bootstrap Telemetry                    (volatile)
9. resumePreamble                         (volatile)
```

Everything through §6 is a stable prefix across every `runner.start` for a
task (and, for auto-caching providers, largely shared *across tasks* too — §1–4
are identical for all engineer runs). The volatile tail is small.

Also drop the misleading `**Cache:** hit/miss` line (always "miss" in rendered
content anyway) and the per-step `durationMs` in Bootstrap Telemetry (keep
pass/fail, drop the millisecond timings) — both add per-run entropy for no
agent value.

### Finding 2 — Ross/Debugger re-dump the whole board every turn

**What breaks:** not the cache prefix (it's appended), but raw waste — ~35 KB
of immediately-stale board state added per turn, accumulating in the transcript
and the context window.

**Fix (Phase 2):**
- Send `repoGuideContext` **once**, at session start.
- On `runner.send`, compute a **delta** since the last turn ("since your last
  message: #0312 → review, #0315 created, #0290 → done") — a few lines instead
  of 35 KB.
- Or, at minimum, send a compact summary (status counts + only the tasks that
  changed) rather than the full 290-line render.

### Finding 3 — oracle calls pay full price for a yes/no

**What breaks:** `runPrompt` spawns a new CLI process with no session, so there
is no conversation to cache and the CLI re-establishes its system-prompt cache
entry from cold every call. A CTO cycle, a done-guard check, a review-triage —
each is seconds of process spawn + a large uncached prompt for a one-line
answer.

**Fix (Phase 3):** for the calls that are genuinely *one prompt → short answer,
no tools*, add a direct API path:
- frozen system prompt with `cache_control` (Anthropic) — every call after the
  first is ~10% input cost
- a small/fast model (Haiku-class) for classification
- no process spawn

Gate it behind a provider-neutral seam so it degrades to the current
`runPrompt` path when no direct-API key is configured. Prototype on the
highest-frequency oracle first (likely the done-guard) and measure cost +
latency before rolling out.

---

## Expected outcome

- **Finding 1 fix:** on multi-`start` tasks (i.e. any task that bounces through
  review), the stable prefix — task spec + AGENTS.md + checklist + workflow,
  ~8–10 KB — becomes a cache hit on the 2nd activation onward. ~40–70% off the
  *input* cost of those activations where the provider caches; a smaller but
  real latency win (cached prefix processes faster → less dead time before the
  agent starts).
- **Finding 2 fix:** Ross/Debugger turns drop from ~35 KB to ~1 KB of injected
  context; long chats stop burning the context window on stale board snapshots.
- **Finding 3 fix:** each converted oracle call goes ~3–8 s → ~0.5–1.5 s and
  ~10–20× cheaper. ~5–10 such calls per task lifecycle.

Not a large dent in total task *wall-time* (output generation still dominates)
— this is a cost + responsiveness play.

---

## Sequencing

1. **Collect Phase 0 data** — run real tasks; read `cacheReadTokens` on the
   Tokens tab. Confirms whether the opencode/DeepInfra models cache at all.
2. **Finding 1** — reorder `missionFor` + `renderPack`. Low risk (reordering
   text), directly measurable against the Phase 0 numbers.
3. **Finding 2** — delta-based context for Ross/Debugger.
4. **Finding 3** — direct-API oracle path, prototype + measure first.
