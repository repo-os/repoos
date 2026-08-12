# Agent skill-gap audit

**Version:** 3 · **Date:** 2026-08-12 · **Task:** #0107 · **Status:** review

Audit of RepoOS agent task histories for recurring skill gaps, repeated
discoveries, stalls, and manual recoveries — with the smallest durable
intervention recommended for each finding. Recommendations first.

This audit creates no skills and mutates no other tasks. Any skill creation
or follow-up implementation is a separate task requiring approval.

---

## 1. Recommendations (ranked)

Ranked by expected time saved × frequency × failure severity, against
implementation effort and ongoing maintenance cost. Evidence task IDs in
§4–§5; rubric in §3.

| # | Recommendation | Intervention | Evidence tasks | Time saved | Freq | Severity | Effort | Maint |
|---|---|---|---|---|---|---|---|---|
| R1 | Land the merge queue (#0118, already `ready`) | RepoOS API/tooling fix | 0047, 0069, 0113, 0118 + git history | High | High | **Critical** (conflict markers reached `main`) | High | Low |
| R2 | Create skill `agent-cli-probe` + versioned CLI/model compatibility reference | **New skill** + docs | 0043, 0058, 0060, 0083, 0085, 0099, 0109 | High | High | Med | Med | Med (needs last-verified dates) |
| R3 | AGENTS.md additions: commit-policy rule + one-retry flake protocol | AGENTS.md/docs | 0063, 0076, 0113 | Med | High | Med | Trivial | None |
| R4 | Create skill `ui-verify` (server-owned preview verification) | **New skill** | 0046, 0054, 0080, 0096 | Med | High | Med | Low | Low |
| R5 | Fix activity-log integrity (duplicate sections, out-of-order timestamps) | RepoOS tooling fix (new task) | 0041, 0063, 0068, 0070, 0075, 0077, 0080, 0085, 0094, 0099, 0108, 0109 | Med | High | Med (blocks future audits) | Med | Low |
| R6 | Fix reviewer-agent crashes (3/4 runs failed with no report — all failures on `opus`; the one success ran a different model) | RepoOS tooling fix (new task) | reviews 0090, 0094, 0104, 0106 | Med | Med | Med | Low | Low |
| R7 | Proceed with #0111 (evidence-based agent/model recommendations) | Agent/model configuration | 0080, 0106, 0109 (override churn) | Med | Med | Low | Med | Med |
| R8 | Adopt a lightweight skill-candidate flagging mechanism (§6) | RepoOS API/tooling fix | this audit | Med | — | Low | Low | Low |
| R9 | No action: tunnel setup, preview ports, stale builds, sandbox handoff | No action (already covered) | §5 | — | — | — | — | — |

**Do not create skills for:** merge/close-out recovery (R1's product fix is
the right home — a skill would paper over the race), tunnel publishing (the
#0106 assistant supersedes prose guidance), preview/stale-build/sandbox
knowledge (already in AGENTS.md + mission text + context packs; see §5).

---

## 2. Sample and evidence sources

### Sample (51 tasks read in full)

- **Successful/fast:** 0038, 0047, 0060, 0076, 0096, 0103, 0108
- **Slow / long-lived:** 0029, 0045, 0051, 0052, 0053, 0056, 0090, 0114
- **Restarted / status-churning:** 0043, 0054, 0066, 0069, 0075, 0077, 0079, 0080, 0088
- **Blocked / needs-input / never started:** 0039, 0058, 0067, 0075, 0082, 0094, 0111
- **Merge-conflicted / close-out:** 0047, 0069, 0074, 0095, 0113, 0118
- **Failed-agent / failure-adjacent:** 0044, 0080, 0109 (+ reviewer failures on 0094, 0104, 0106)
- **Other reviewed:** 0012, 0035, 0041, 0046, 0063, 0064, 0068, 0070, 0083, 0085, 0087, 0099, 0106, 0107, 0116

Full ID list: 0012, 0029, 0035, 0038, 0039, 0041, 0043, 0044, 0045, 0046,
0047, 0051, 0052, 0053, 0054, 0056, 0058, 0060, 0063, 0064, 0066, 0067,
0068, 0069, 0070, 0074, 0075, 0076, 0077, 0079, 0080, 0082, 0083, 0085,
0087, 0088, 0090, 0094, 0095, 0096, 0099, 0103, 0106, 0107, 0108, 0109,
0111, 0113, 0114, 0116, 0118.

Tasks cited second-hand (referenced inside other tasks' evidence, not read
in full): 0036, 0049, 0089, 0101, 0104.

### Evidence sources

- Task files under `work/` — frontmatter, spec, and `## Activity` logs
- Git history (`git log --all`): merge-fix and sync commits (§4, F1)
- Reviewer-agent reports: `.repoos/reviews/{0090,0094,0104,0106}.md` (main
  checkout)
- RepoOS sources as evidence of existing guidance: `src/server/agents.ts`
  (mission text), `src/core/context-pack.ts` (context packs), `AGENTS.md`,
  `skills/`, `docs/adr/`
- **Transcripts:** #0090 (transcript persistence) landed mid-audit;
  `.repoos/sessions/` now persists live sessions, but only for sessions
  started after the merge. No transcripts exist for the sampled task
  histories. This is stated as a limitation (§7), not papered over.
  (v1 stated #0090 was still `active`; the main-checkout copy showed
  `review` — the worktree copy this audit was written from was stale.)

### Secrets policy

No tokens, credentials, or tunnel secrets were found in any reviewed task
file; nothing required redaction. Tunnel tasks discuss secrets only
abstractly (e.g., "API token stored yes/no without exposing its value").
This audit copies no credential material.

---

## 3. Evaluation rubric

For each candidate gap, the intervention choice answers:

1. **Is it reusable operational knowledge, or a product defect?** A defect
   (race, crash, false-positive readback) gets a product/tooling fix — a
   skill that papers over a bug is rejected by definition.
2. **Is it already covered?** AGENTS.md, mission text (`missionFor` in
   `src/server/agents.ts`), context packs, ADRs, existing skills, or a
   ready/in-flight task. If covered → no action (or improve coverage).
3. **Is it procedural or reference?** Procedures with trigger conditions
   suit skills; lookup data suits versioned docs.
4. **Evidence bar:** ≥ 2 tasks with concrete evidence per proposed skill,
   unless a single incident is high-impact and broadly repeatable.
5. **Ranking inputs:** expected time saved, frequency, failure severity,
   implementation effort, maintenance cost.

---

## 4. Findings

### F1 — Task close-out and merge conflicts are the dominant failure surface

**Evidence:**
- #0118's problem statement catalogs the recurring failures: branches race
  while merging; tasks tested against an old `main`; retries treating a
  partial close-out as fresh; "task Markdown has reached main with literal
  conflict markers even though Git reported success."
- Git history confirms: `ca82a2d docs: remove stale task conflict marker`;
  three restore-after-merge rework commits (`fix: restore handoff features
  lost in #0109 merge`, `fix: restore stats and dispose methods lost in
  #0094 merge`, `fix(agents): restore server-owned handoff after merge`);
  `6c6dcee merge: sync repaired main into task 0113` (main itself needed
  repair mid-flow).
- The sync ritual at scale (v1's "13" was under-scoped; corrected in v3):
  `main` carries **56** identical `chore: sync working tree before merge`
  commits — 6 on 2026-08-07, 32 on 2026-08-11, 18 on 2026-08-12 (through
  13:05 local) — plus 3 more on unmerged branches. The ritual continued
  during this audit's own review cycle: three further sync commits at
  13:31–13:34 on 2026-08-12, including `351ea0c` on this task's branch.
- #0069: move-to-done failed silently with HTTP 400 on conflict; "#0063 was
  blocked by `TaskCard.vue`, #0054 by `server.ts` — both trivial 'keep both
  sides' merges, but the close-out has no remedy except a human resolving in
  git by hand."
- #0047 documents the pre-automation era: "moving it to `done` requires
  hand-rolled git … done by hand for #0036 / #0044."

**Existing coverage:** #0118 (merge queue, `ready`), #0095 (auto-sync,
done), #0069 (visible errors + `needs_merge`, done). AGENTS.md forbids
agents from merging.

**Classification: product defect → RepoOS API/tooling fix (R1).** A
"merge-recovery skill" is explicitly rejected: it would paper over the race
that #0118 removes, and agents are already forbidden from merging.

### F2 — Commit-policy confusion: `dist/`, `screenshots/`, `node_modules`

**Evidence:**
- #0113: committing generated artifacts on feature branches "causes 90% of
  merge conflicts when landing tasks to main … Recent victims: #0080,
  #0094, #0106, #0104 — every merge needed manual dist/screenshots conflict
  resolution." Git shows `9178fa4 fix(0113): exclude generated artifacts
  from handoff commits` — the handoff initially committed artifacts.
- #0063: "a stuck claude run had committed `node_modules` (272 files) into
  task #0054's branch … the only path was manual worktree inspection and a
  hand-rolled `git rm -r --cached node_modules` cleanup."

**Existing coverage:** the mission text now states the policy
(`src/server/agents.ts`: "RepoOS commits only source, work, docs, and
config files … never `dist/` or `screenshots/`"), added by #0113. **But
AGENTS.md's Rules section does not carry it**, so agents resuming without a
mission (or humans) miss it.

**Classification: AGENTS.md/docs (R3).** One rule line; no skill needed.

### F3 — Repeated CLI/model discovery (strongest skill candidate)

**Evidence:**
- #0109 pinned hard-won knowledge into its body with the explicit admission
  agents re-derive it: "**Verified CLI behavior (captured live, claude
  2.1.220 — do not re-derive)**" (`stream-json` requires `--verbose` in
  print mode; a non-JSON warning line can appear on stdout).
- #0060's notes record per-CLI model-enumeration knowledge plus a past dead
  end ("Do NOT try to parse claude's enterprise `availableModels` settings").
- #0083 instructs re-discovery as policy ("Verify exact installed-CLI
  syntax during implementation"); #0058 requires re-verifying `agy` basics
  from scratch; #0043 recorded that `github-anomalyco-opencode` shadows the
  headless CLI on PATH.
- #0085 needed **4 review-fix rounds**, two caused by real-CLI behavior
  fake-binary tests could not catch (Codex trusted-directory preflight;
  Claude/Qwen probes coupled to model discovery).
- Hard-coded → live → hard-coded churn: #0035 hard-coded models → #0060
  built live discovery → #0099 re-hard-coded a claude list that disagrees
  with #0060's recorded aliases. Model knowledge is fragmented across task
  bodies with no single source of truth.

**Existing coverage:** partial — knowledge lives inside individual task
bodies. #0111 (`ready`) will cover *recommendations*, not *compatibility
mechanics*. No skill covers it.

**Classification: new skill + versioned docs reference (R2).** Spec in §5.

### F4 — UI verification mistakes: probing the wrong build / port collisions

**Evidence:**
- #0046: "Observed live: the served `index.html` referenced
  `assets/index-BMBnkhS2.js` while the worktree's own build referenced
  `assets/index-BAtSxOm1.js`" — the agent verified the wrong build.
- #0096 incident report: tasks #0089 and #0049 both launched worktree
  servers on 7171; one hit `EADDRINUSE`; the auto-reload handoff released
  the listener; port 7171 ended with no listener, two orphaned
  `repoos serve` processes, and three engineering agents orphaned under
  PID 1. Root cause: missions still told agents to run `repoos serve`.
- #0080: the sandboxed preview's API layer ran the main checkout's older
  server code, so live behavior could not be demonstrated from the worktree
  preview — a verification subtlety agents keep rediscovering.

**Existing coverage:** #0096 fixed the product (server-owned previews,
direct `repoos serve` rejected); AGENTS.md + mission + context packs all
carry the preview API recipe. What is *not* covered is the verification
*procedure* (freshness check, asset-hash comparison, what to conclude when
the preview serves stale main-checkout code).

**Classification: new skill `ui-verify` (R4).** Spec in §5.

### F5 — Permission/sandbox failures and privileged operations

**Evidence:**
- #0044: worktree paths classified `external_directory`, auto-rejected in
  headless mode — "The user rejected permission" on the first read.
- #0094: Codex "cannot create the Git index lock, write objects/refs, or
  commit because that Git metadata is outside its writable sandbox root";
  #0029 demonstrated the block; #0113's handoff stalled 12 minutes on the
  same boundary before the server-side fix.
- #0080: "#0069 and #0077 … sat hung on an unanswered permission prompt
  for ~2 hours with zero commits before being killed by hand."

**Existing coverage:** ADR-0005 (agents express intent; RepoOS performs
privileged operations), #0094 trusted handoff (done), mission checklist
("Do not run git add/commit … outside your sandbox"), #0080 stall warning,
#0112 heartbeats (`ready`).

**Classification: no action (R9).** The durable fixes are product + ADR;
the agent-facing knowledge is already injected per-task. A skill here would
duplicate the mission text.

### F6 — Stale builds

**Evidence:** #0012 ("the stale-build hazard is already named in AGENTS.md
as the #1 time-waster … currently handled by a PROSE rule"); #0066
(`/api/models` live on disk but unserved because the server predated the
build); #0046 (wrong-build verification, also F4).

**Existing coverage:** #0012's staleness guardrail (product), AGENTS.md
warning, context-pack bootstrap telemetry.

**Classification: no action (R9).** Covered by product guardrail + docs.

### F7 — Flaky `repoos check`

**Evidence:** #0076: "Observed 3x this cycle (#0063 twice, #0067 once):
the first `repoos check` after a build reported `✗ tests` … a second
`repoos check` passed." Also notes the dangerous shape: flake after merge
returns `ok:false` with `merged: true`, stranding the task in `review`.

**Existing coverage:** #0076 fixed the gate (done). But no instruction
tells an agent the correct *behavior* on a check failure (diagnose, re-run
once, never weaken tests).

**Classification: AGENTS.md one-liner (R3, merged with F2).** Not a skill:
one sentence of policy, not a procedure.

### F8 — Worktree-root confusion and canonical-copy divergence

**Evidence:**
- #0077: "the agent did the readback with `repoos show 0068` instead of
  literally reading the file … from inside a task's worktree … silently
  resolve to the worktree's own root … The readback showed `review` … but
  it was reading the wrong copy. … This isn't a one-off prompt-following
  slip — it's a structural false-positive any agent will hit."
- #0067: "#0063's agent committed the worktree copy of the task file with
  `status: review` … but never updated the main-checkout copy, so the
  board on 7171 kept showing `active`."

**Existing coverage:** #0077 fixed it in product (worktree-aware
`findRepoRoot`, server-side self-heal on agent exit); the mission's
fail-safe checklist encodes the correct readback behavior.

**Classification: no action (R9).** Product defect fixed; residual
knowledge is in the mission. (If divergence recurs, revisit as tooling.)

### F9 — Cloudflare tunnel setup repeated three times

**Evidence:** the same `cloudflared` sequence (login → create tunnel →
route dns → run) was specified from scratch in #0068 (CLI), re-described as
UI panel instructions in #0079, then re-derived a third time in #0106 as a
validated assistant — which explicitly exists to "replace the static
instructional treatment introduced by task 0079", i.e., #0079's deliverable
was redone ~4 hours after completion. #0106 also catalogs recurring
zero-trust mistakes (wrong base domain, wrong local port, expecting to
paste an API token into the web UI).

**Existing coverage:** #0106's validated setup assistant (product) now
embodies the procedure, including secret-handling rules ("Never request,
display, persist, interpolate, or copy a Cloudflare API token in the
browser UI").

**Classification: no action (R9).** The assistant is the durable
intervention; a tunnel skill would duplicate it and rot as `cloudflared`
syntax changes (all three tasks note the syntax may drift).

### F10 — Stalls, restarts, and mid-task agent/model substitution

**Evidence:**
- Restart churn: #0054 (6 active↔ready cycles), #0069 (5 + an ~8.5h
  stall), #0066 (3), #0077 (2), #0075 (5 flips, 3 `needs_input`, 1
  `blocked`, dependency rework 0069→0095, engine override, still `ready`
  after ~15h).
- Overnight stall → CLI swap: #0109 shows ~8h of silence, then
  `cli_override` to opencode, then `active→review` 2 minutes later.
  #0080 and #0106 also carry late `codex`/`gpt-5.6-luna` overrides.
- Pickup latency: #0056 sat in `ready` 4 days; #0029 6 days in `inbox`;
  #0039 5 days in `inbox` then five status flips in 38 seconds.

**Existing coverage:** #0080 (server-side stall detection), #0112
(periodic heartbeats, `ready`), #0087 (resource release, done), #0067
(waiting-on-human signal, done).

**Classification: agent/model configuration via #0111 (R7), not a skill.**
"When to swap the engine" is a judgment call that needs evidence-based
recommendations (#0111), not a procedure. Per the task spec, elapsed time
was not used to judge agents: the stalls above are attributable to
permission waits (#0080), dependency sequencing (#0075), and pickup
latency (#0056), not reasoning speed.

### F11 — Activity-log integrity undermines auditability

**Evidence:**
- Duplicate `## Activity` sections in one file: 0041, 0043, 0045, 0046,
  0063, 0077, 0085, 0094, 0109 — sometimes with conflicting entries
  (#0063 has two review-transition records 3 minutes apart; #0046's only
  `active→review` record lives in the stray top section).
- Out-of-order timestamps: #0035, #0068 (done logged ~7.5h before
  review), #0070, #0075, #0080, #0099, #0108 (active→review logged after
  review→done).
- Missing transitions: #0044, #0045, #0047, #0064, #0067, #0074, #0079,
  #0087, #0088, #0106 (log ends at `ready→active` despite `done`).
- Stale flags: #0074 is `done` with `needs_merge: true` still set.

**Existing coverage:** none.

**Classification: product defect → RepoOS tooling fix (R5).** This is not
agent behavior — the writer/parser is merging or appending activity
sections inconsistently, and some timestamps suggest timezone/clock
mishandling. It directly limits this audit's confidence and will limit any
future one.

### F12 — Reviewer agent failed 3 of 4 runs, with a model correlation

**Evidence:** four reports exist in `.repoos/reviews/` (main checkout).
Three are failures — 0094, 0104, 0106, all run with `cli: opencode` and
`model: opus`: "The review agent produced no report: opencode exited
without output" followed by a truncated JSON error fragment (`err_…`).
One is a success — 0090 (`state: ok`, `model: opencode/big-pickle`), a
full usable report (verdict, bugs, edge cases). The failure set is
uniformly `opus`; the single non-`opus` run succeeded. (v1 missed the
0090 report and overstated this as 3/3.)

**Existing coverage:** none — #0101 built the mechanism, but the runner
failure is unaddressed.

**Classification: product defect → RepoOS tooling fix (R6).** Capture
exit diagnostics, fail the report loudly, retry once. The `opus`-only
failure pattern also feeds R7 (model selection): the reviewer's default
model may simply be misconfigured for the installed opencode. Not a
skill.

---

## 5. Proposed skills (full specs)

Only two findings clear the bar for a new skill: genuinely procedural,
recurring (≥ 2 evidence tasks), and not better fixed in product. Both are
proposals — creation is a separate approved task.

### Skill 1: `agent-cli-probe` (R2)

- **Purpose:** Stop agents from re-deriving coding-agent CLI behavior
  (headless invocation, model enumeration, streaming/output formats,
  permission flags) by providing a verification procedure and a pointer to
  the versioned compatibility reference.
- **Trigger conditions:** task touches `src/server/agents.ts` driver/model
  code, `src/core/detect.ts`, or `src/core/models.ts`; or task area is
  `agent` and mentions a CLI name (opencode, claude, codex, gemini/agy,
  qwen, pi); or a model/CLI probe fails unexpectedly.
- **Non-goals:** choosing which model to use for a task type (that is
  #0111's recommendations guide); general RepoOS workflow rules (AGENTS.md);
  storing secrets or credentials.
- **Required inputs:** the CLI(s) named in the task; the installed-binary
  reality (`which <cli>`, `<cli> --version`); the current compatibility
  reference doc.
- **Expected outputs:** verified flag syntax recorded back into the
  reference doc with a last-verified date; fake-binary test fixtures for
  any new driver behavior; no undocumented flag used without a live probe.
- **Evidence task IDs:** 0043, 0058, 0060, 0083, 0085, 0099, 0109.
- **Validation scenario:** apply the skill to #0058 (agy driver). The agent
  should consult the reference first, probe `agy --help` live, record the
  verified invocation, and avoid assuming Gemini-CLI flag parity — the
  exact failure mode #0058's spec warns about.
- **Companion doc:** a versioned `docs/agent-cli-compat.md` matrix (one row
  per CLI: headless command, model listing source, output format, session
  resume, last-verified date). Skill = procedure; doc = data. Coordinate
  with #0111 to avoid two overlapping docs (see §8 overlap flags).

### Skill 2: `ui-verify` (R4)

- **Purpose:** Verify UI changes through the server-owned managed preview
  without being fooled by stale builds, wrong asset hashes, or
  main-checkout code served into the worktree preview.
- **Trigger conditions:** any task with UI changes (`src/ui-app/**`)
  before reporting `review`; or a preview probe shows unexpected content.
- **Non-goals:** launching servers or choosing ports (forbidden — AGENTS.md);
  fixing the preview infrastructure itself; non-UI verification (`repoos
  check` covers tests/smoke).
- **Required inputs:** the managed preview URL from
  `POST $REPOOS_API_URL/api/tasks/$REPOOS_TASK_ID/preview`; the worktree's
  fresh build (`bun run build` / `build:ui` first).
- **Expected outputs:** confirmation that (1) the build is fresh (no
  staleness warning), (2) the served `index.html` asset hash matches the
  worktree's `dist/` build (the #0046 check), (3) the app mounts with no
  unrendered mustache and zero console errors, (4) any server-behavior
  claim is attributed to the right code — the preview's API layer may run
  the main checkout's server build (#0080's subtlety), so server-side
  claims are verified via direct AgentRunner/server tests instead.
- **Evidence task IDs:** 0046, 0054, 0080, 0096.
- **Validation scenario:** re-run a #0046-style check after a UI change:
  the agent must compare served vs built asset hashes and catch a mismatch
  instead of reporting success on the wrong build.

---

## 6. Proposed close-out mechanism: skill-candidate flagging (R8)

Goal: let agents flag skill candidates during close-out **without ever
creating skills automatically**.

1. **Signal:** extend the handoff protocol with an optional line the agent
   may emit alongside `::repoos-handoff-ready::`:
   `::repoos-skill-candidate:: <slug> — <one-line gap> — evidence: <task ids>`
2. **Storage:** the server parses it at handoff and appends to
   `.repoos/skill-candidates.json` (derived data in the cache dir, like
   reviews and context packs — never committed).
3. **Deduplication:** entries are keyed by normalized slug; a repeat flag
   increments a counter and appends the new evidence task ID instead of
   adding a new entry.
4. **Human review:** candidates surface read-only in the UI (the Context
   page already renders skills, #0038) with their counter and evidence
   links. Nothing happens without a human.
5. **Creation path:** approval creates a task (exactly like #0107's audit
   or a follow-up "create skill X" task); only an approved task may add
   files under `skills/`.
6. **Safeguards:** cap the candidate list (drop oldest beyond N); strip
   values that look like secrets from the one-line gap text; candidates are
   advisory — the reviewer agent and humans may dismiss them with a reason
   recorded next to the entry.

---

## 7. Limitations

- **No historical transcripts.** #0090 (transcript persistence) landed
  mid-audit; `.repoos/sessions/` now persists sessions, but only ones
  started after the merge, so none of the sampled task histories have
  transcripts. Findings rest on task files, activity logs, git history,
  and review reports. Fine-grained failure attribution (model latency vs
  permission waits vs reasoning gaps) is therefore approximate; where
  possible causes were taken from the tasks' own incident accounts (e.g.,
  #0080 naming permission prompts) rather than inferred from elapsed time.
- **Activity-log integrity (F11).** Duplicate sections, missing
  transitions, and out-of-order timestamps mean some sequences could not be
  reconciled; affected tasks are listed in F11 and were read with reduced
  confidence.
- **Sample bias.** 50 of 51 sampled tasks are from 2026-08-05 to
  2026-08-12 (the worktree era); only #0012 dates to June. May–June tasks
  have thin logs (e.g., #0012's log starts mid-lifecycle). Pre-worktree
  failure modes may be under-represented.
- **Reviewer reports unavailable for most tasks** (F12): only four exist;
  three are crash artifacts and one (0090) is usable.
- **Second-hand citations:** tasks 0036, 0049, 0089, 0101, 0104 are cited
  via other tasks' incident accounts, not read in full.

---

## 8. Inventory of existing guidance (and overlap flags)

| Artifact | Covers | Overlap / consolidation notes |
|---|---|---|
| `AGENTS.md` (this repo) | Operating loop, review/sign-off, definition of done, self-hosting rules, conventions, git-setup anti-patterns, server-owned previews | Missing: commit-policy rule (F2), flake-retry protocol (F7). Overlaps with `code-review` skill on review procedure — keep AGENTS.md as policy, skill as checklist |
| Mission text (`missionFor`, `src/server/agents.ts`) | Fail-safe checklist, handoff signal, sandbox boundaries, commit policy | The only home of the dist/screenshots rule — promote to AGENTS.md too (R3) |
| Context packs (`src/core/context-pack.ts`) | Task spec, worktree state, AGENTS.md constraints, likely files, verification commands, managed preview, bootstrap telemetry, resume state | Already addresses repeated codebase discovery (#0097). Should gain a skills section only once #0039 lands |
| ADR-0005 | Agents express intent; RepoOS performs privileged ops | Covers F5 durably; no change needed |
| `skills/code-review` | Review-gate procedure | Consolidation candidate with AGENTS.md review section: keep, but it should cite AGENTS.md as authority rather than restating policy |
| `skills/caveman` | Novelty/test skill | No audit relevance; candidate for removal if #0039 skill assignment ships and list hygiene matters |
| `docs/` (architecture, concepts, roadmap, vision, 5 ADRs) | Product vocabulary and decisions | No agent-operational docs yet — R2's compat matrix would be the first |
| AGENTS.md template in `src/commands/init.ts` | Guidance shipped to *other* repos | Not affected by this audit; do not conflate with this repo's AGENTS.md |

**Operational knowledge vs product defects — explicit split:**

- Operational knowledge (skill/docs candidates): CLI probing procedure
  (F3), UI verification procedure (F4), commit policy (F2), flake protocol
  (F7).
- Product defects (never skills): merge race (F1→#0118), activity-log
  integrity (F11), reviewer crashes (F12), sandbox boundary (F5→#0094/
  ADR-0005), worktree-root readback (F8→#0077), stale builds (F6→#0012),
  preview ownership (F4's collision half→#0096).

---

## 9. Prioritized next actions

1. **Land #0118** (merge queue) — already `ready`; highest severity (R1).
2. **Approve a task to create `agent-cli-probe` skill + compat matrix doc**
   — sequence with #0111 so the matrix and recommendations guide share one
   versioned home (R2, R7).
3. **AGENTS.md one-liners** — commit-policy rule + single-retry flake
   protocol (R3). Trivial; can ride along with any next task.
4. **Approve a task to create `ui-verify` skill** (R4).
5. **Open a task for activity-log integrity** — single writer path,
   monotonic timestamps, one Activity section per file (R5).
6. **Open a task for the reviewer-agent crash** — capture exit diagnostics,
   fail the report loudly, retry once (R6).
7. **Implement skill-candidate flagging** (§6) after the first approved
   skill lands, so the mechanism has something to deduplicate against (R8).

All skill creation and follow-up implementation remain separate tasks
requiring approval. This audit created none.

---

## Revision history

| Version | Date | Change |
|---|---|---|
| 1 | 2026-08-12 | Initial audit (#0107): 51-task sample, 12 findings, 2 proposed skills, 9 ranked recommendations |
| 2 | 2026-08-12 | Corrections after re-verification: reviewer report 0090 (usable, `state: ok`) added to F12/R6 — failures are 3/4 and correlate with the `opus` model; #0090 landed mid-audit so transcript persistence now exists but covers no sampled history; fixed stale "0090 still active" claim (worktree copy was stale; main checkout showed `review`) |
| 3 | 2026-08-12 | F1 sync-commit count corrected and scoped per review feedback: v1's "13" was under-scoped — `main` has 56 `chore: sync working tree before merge` commits (6 on 08-07, 32 on 08-11, 18 on 08-12 through 13:05) plus 3 on unmerged branches; added new evidence that the ritual continued during this audit's review cycle (3 more sync commits 13:31–13:34, incl. `351ea0c` on this task's branch) |
