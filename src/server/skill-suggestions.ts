/**
 * Evidence-gated auto-suggestions for reusable skills (#0429, superseding
 * #0405's "analyse at review" pass).
 *
 * A reusable skill is a high-bar artifact: a stable procedure that will help on
 * FUTURE, materially different tasks, with real decisions/branches and evidence
 * that it saves repeated investigation. One-off bug fixes, task-specific
 * checklists, test ideas, repository-local style rules, review feedback, and
 * unverified or failed outcomes are NOT skills.
 *
 * #0424 (a narrow, unverified CSS workaround filed from #0410 and later shown
 * wrong) is the incident this gate exists to prevent. The pass therefore:
 *
 *   - Runs only when a task genuinely reaches `done`/close-out — never on the
 *     `review` transition, where the outcome is not yet verified.
 *   - Defaults to no suggestion: the analysis must affirmatively say a candidate
 *     is eligible AND attach the evidence (repeatable trigger + why a test /
 *     instruction / task would be insufficient). Ambiguous evidence is rejected.
 *   - Requires corroboration before anything user-visible exists. The first
 *     eligible candidate is persisted internally (`.repoos/skill-candidates.json`)
 *     and creates no task. A suggestion task is created only when a second,
 *     independent completed task session evidences the same candidate. A named
 *     stable external tool/API workflow is recorded as extra evidence but does
 *     NOT lift the two-session rule: a single session must never create one.
 *   - Creates at most ONE suggestion task per candidate, and never writes a live
 *     skill file. The human approval gate is unchanged.
 *
 * Best-effort: a failure (no agent, bad JSON, timeout) creates nothing and never
 * surfaces an error to the task's normal flow.
 *
 * Zero runtime deps — node:fs / node:path only.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, AgentOutputEntry, RepoOSConfig, Status, Task } from "../core/types.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import { commitTaskFile } from "../core/git.js";
import { utcTimestamp } from "../core/task.js";
import type { Logger } from "../core/logger.js";
import {
  extractOneShotReportText,
  recordOneShotSession,
  resolveAgentForTask,
  resolvePmAgent,
  resolveReviewerForTask,
  runPrompt,
  type PromptResult,
} from "./agents.js";

/** The frontmatter key that links an origin task to its suggestion task. */
export const SKILL_SUGGESTION_KEY = "skill_suggestion";

/** Where the internal first-candidate evidence is persisted, relative to cacheDir. */
const CANDIDATE_STORE_FILE = "skill-candidates.json";

/** Cap on the task spec quoted into the analysis prompt (keeps it bounded). */
const SPEC_CHARS = 4000;

/** Cap on the session transcript quoted into the analysis prompt. */
const TRANSCRIPT_CHARS = 30_000;

/** Cap on a generated draft body, so a runaway model cannot blow up a task file. */
const SKILL_BODY_CHARS = 12_000;

/**
 * The analysis's verdict category. Only `reusable-workflow` and
 * `external-workflow` can ever become a skill; the rest are the explicit
 * rejections the task spec calls out.
 */
export type SkillCategory =
  | "reusable-workflow"
  | "external-workflow"
  | "one-off-edit"
  | "task-checklist"
  | "test-idea"
  | "local-convention"
  | "review-feedback"
  | "unverified"
  | "ambiguous";

/** Categories that may become a skill at all. */
const ALLOWED_CATEGORIES = new Set<SkillCategory>(["reusable-workflow", "external-workflow"]);

/** A parsed draft skill, ready to render as SKILL.md. */
export interface SkillDraft {
  /** Stable identity of the procedure, used to corroborate across sessions. */
  key: string;
  /** Human-readable procedure name, e.g. "Snapshot a failing test run". */
  name: string;
  /** One sentence describing when to use the skill. */
  description: string;
  /** The repeatable trigger that makes this reusable on a future, different task. */
  trigger: string;
  /** Why a test, instruction, or ordinary task would not be sufficient. */
  insufficientRationale: string;
  /** True when this is a named, stable external tool/API workflow. */
  externalWorkflow: boolean;
  /** The named external workflow, when `externalWorkflow` is true. */
  externalWorkflowName: string;
  /** The SKILL.md body (markdown, without frontmatter). */
  body: string;
}

/** A secondary candidate that is mentioned but never given its own task. */
export interface SkillCandidate {
  name: string;
  description: string;
}

export interface SkillSuggestionResult {
  /** Whether the analysis affirmatively judged this eligible for consideration. */
  eligible: boolean;
  /** The verdict category (drives the explicit rejection cases). */
  category: SkillCategory;
  /** Why it was rejected, when not eligible. */
  rejectReason: string;
  /** The primary draft, or null when no reusable procedure was detected. */
  skill: SkillDraft | null;
  /** Other candidates, mentioned only — never separate tasks. */
  additional: SkillCandidate[];
}

/** A persisted first-candidate that is awaiting corroboration. */
export interface SkillCandidateRecord {
  /** Canonical identity of the procedure (the corroboration key). */
  key: string;
  /** The canonical key, retained explicitly so older records can be migrated. */
  canonicalKey: string;
  /** Normalized alternative keys the model emitted for this procedure. */
  aliases: string[];
  name: string;
  description: string;
  body: string;
  trigger: string;
  insufficientRationale: string;
  externalWorkflow: boolean;
  externalWorkflowName: string;
  /** Independent completed task ids that evidenced this candidate. */
  sourceTaskIds: string[];
  additional: SkillCandidate[];
  firstSeenAt: string;
  updatedAt: string;
  /** Set once a suggestion task has been created, so it never doubles up. */
  suggestedTaskId?: string;
}

/** Internal storage for first-candidate evidence. */
export interface SkillCandidateStore {
  get(key: string): SkillCandidateRecord | null;
  /** Every stored candidate (used for alias/fuzzy cross-session matching). */
  all(): SkillCandidateRecord[];
  /** Persist a record. Returns false when the write did not land. */
  put(record: SkillCandidateRecord): boolean;
}

/** JSON-file-backed candidate store under the repo's cache dir. */
export class FileSkillCandidateStore implements SkillCandidateStore {
  constructor(private readonly filePath: string) {}

  private readAll(): Record<string, SkillCandidateRecord> {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, SkillCandidateRecord>;
      }
    } catch {
      /* missing or malformed store — treat as empty */
    }
    return {};
  }

  get(key: string): SkillCandidateRecord | null {
    return this.readAll()[key] ?? null;
  }

  all(): SkillCandidateRecord[] {
    return Object.values(this.readAll());
  }

  /**
   * Write the whole store atomically: serialize to a sibling temp file, then
   * rename over the target so a crash mid-write can never truncate the store or
   * expose a half-written JSON document to the next read. Returns false when
   * the write could not land, so the caller can log it instead of hiding it.
   */
  put(record: SkillCandidateRecord): boolean {
    const all = this.readAll();
    all[record.key] = record;
    const tmp = `${this.filePath}.tmp`;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(tmp, `${JSON.stringify(all, null, 2)}\n`);
      renameSync(tmp, this.filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/** What the manager needs in order to run a pass. */
export interface SkillSuggestionDeps {
  config: RepoOSConfig;
  /** Render the completed session transcript for a task (engineer session). */
  getTranscript: (taskId: string) => AgentOutputEntry[];
  /** Create the suggestion task through the normal RepoOS path. */
  createTask: (input: {
    title: string;
    type: string;
    status: Status;
    assignedTo: string;
    area: string;
    body: string;
  }) => Task;
  /** Persist the origin→suggestion link on the originating task. */
  markOrigin: (origin: Task, suggestionId: string) => void;
  /** Internal first-candidate evidence store. Defaults to the cache-dir JSON file. */
  candidateStore?: SkillCandidateStore;
  logger?: Logger;
  /** Injectable analysis runner; defaults to the real one-shot `runPrompt`. */
  analyze?: (agent: Agent, prompt: string, cwd: string) => Promise<PromptResult>;
}

/**
 * Flatten a transcript into the plain text the analysis prompt is built from.
 * Only content-bearing entries are kept — tool calls include their input and
 * (truncated) output so multi-step procedures are legible to the model.
 */
export function transcriptToText(lines: AgentOutputEntry[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if ("type" in line) {
      if (line.type === "text" && line.text) parts.push(line.text);
      else if (line.type === "human" && line.text) parts.push(`> human: ${line.text}`);
      else if (line.type === "tool") {
        const input = line.input ? ` ${line.input}` : "";
        parts.push(`$ ${line.tool}${input}`);
        if (line.output) parts.push(line.output.slice(0, 4000));
      } else if (line.type === "sys" && line.d) {
        parts.push(`· ${line.d}`);
      }
    } else if ("s" in line && line.d) {
      parts.push(line.s === "err" ? `! ${line.d}` : line.d);
    }
  }
  return parts.join("\n").trim();
}

/** The mission handed to the one-shot analysis agent. */
export function buildSkillSuggestionMission(task: Task, transcript: string): string {
  const spec = task.body.trim().slice(0, SPEC_CHARS);
  const session = transcript.trim().slice(0, TRANSCRIPT_CHARS);
  return [
    "You decide whether a COMPLETED RepoOS task session contained a reusable SKILL.",
    "A skill is a high-bar artifact: a stable, repeatable procedure that would help",
    "another agent on a FUTURE, MATERIALLY DIFFERENT task, with meaningful decisions",
    "or branches, and evidence it saves repeated investigation. Default to rejecting.",
    "",
    "NOT skills (never mark these eligible):",
    "- one-off edits or a single bug fix specific to this task;",
    "- task-specific checklists or acceptance criteria;",
    "- test ideas, individual test cases, or 'write a test for X';",
    "- repository-local style rules or coding conventions;",
    "- review feedback or a reviewer's suggestion for this diff;",
    "- anything whose outcome was failed, unverified, or reverted.",
    "",
    `Task #${task.id}: ${task.title}`,
    "",
    "## The task spec",
    "",
    spec || "(the task file has no body)",
    "",
    "## The session transcript",
    "",
    session || "(no transcript)",
    "",
    "## What to output",
    "",
    "Respond with ONLY a JSON object. No prose, no markdown, no code fences.",
    "Shape:",
    "",
    "{",
    '  "eligible": true,',
    '  "category": "reusable-workflow" | "external-workflow" | "one-off-edit" |',
    '              "task-checklist" | "test-idea" | "local-convention" |',
    '              "review-feedback" | "unverified" | "ambiguous",',
    '  "rejectReason": "one short sentence, required when eligible is false",',
    '  "skill": {',
    '    "key": "stable-lowercase-slug-identifying-this-procedure",',
    '    "name": "Short procedure name",',
    '    "description": "One sentence on when to use it.",',
    '    "trigger": "The repeatable situation that should trigger this skill.",',
    '    "insufficientWhy": "Why a test, an instruction, or an ordinary task is not enough.",',
    '    "externalWorkflow": false,',
    '    "externalWorkflowName": "",',
    '    "body": "The full SKILL.md markdown body, no frontmatter."',
    "  } | null,",
    '  "additional": [ { "name": "...", "description": "..." } ]',
    "}",
    "",
    'Use category "external-workflow" ONLY when the procedure is a named, stable',
    "external tool or API workflow (e.g. a documented CLI/API sequence) — then set",
    '"externalWorkflow": true and put the exact tool/API name in',
    '"externalWorkflowName". Otherwise leave it false and empty.',
    "",
    'Set "eligible" to false and "skill" to null unless you are confident. Set',
    '"skill" to null when no reusable procedure was performed. "additional" lists',
    "any other candidates (name + description only); it may be empty.",
    "The body should read like a real skill: a title, a When to use section, and a",
    "numbered Procedure. Do not invent steps that are not evidenced by the transcript.",
  ].join("\n");
}

/** Find and parse the outermost JSON object in a model's raw answer. */
function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const asBool = (v: unknown): boolean => v === true;

/** Coerce a raw category string to the known set, defaulting to `ambiguous`. */
function asCategory(v: unknown): SkillCategory {
  const s = asString(v);
  return (
    ALLOWED_CATEGORIES.has(s as SkillCategory) ||
    [
      "one-off-edit",
      "task-checklist",
      "test-idea",
      "local-convention",
      "review-feedback",
      "unverified",
      "ambiguous",
    ].includes(s)
      ? s
      : "ambiguous"
  ) as SkillCategory;
}

/**
 * Parse the analysis agent's answer into a validated result. Forgiving: a
 * malformed answer yields an ineligible result (nothing created), never a throw.
 */
export function parseSkillSuggestion(raw: string): SkillSuggestionResult {
  const empty: SkillSuggestionResult = {
    eligible: false,
    category: "ambiguous",
    rejectReason: "",
    skill: null,
    additional: [],
  };
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return empty;
  const obj = parsed as Record<string, unknown>;

  let skill: SkillDraft | null = null;
  const rawSkill = obj.skill;
  if (rawSkill && typeof rawSkill === "object") {
    const s = rawSkill as Record<string, unknown>;
    const name = asString(s.name);
    const body = asString(s.body).slice(0, SKILL_BODY_CHARS);
    if (name && body) {
      skill = {
        key: asString(s.key),
        name,
        description: asString(s.description),
        trigger: asString(s.trigger),
        insufficientRationale: asString(s.insufficientWhy),
        externalWorkflow: asBool(s.externalWorkflow),
        externalWorkflowName: asString(s.externalWorkflowName),
        body,
      };
    }
  }

  const additional: SkillCandidate[] = [];
  if (Array.isArray(obj.additional)) {
    for (const item of obj.additional) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const name = asString(c.name);
      if (!name) continue;
      additional.push({ name, description: asString(c.description) });
    }
  }

  return {
    eligible: asBool(obj.eligible),
    category: asCategory(obj.category),
    rejectReason: asString(obj.rejectReason),
    skill,
    additional,
  };
}

/**
 * The deterministic evidence gate applied on top of the model's own verdict.
 * Returns a reason when the draft is not eligible; the pass then creates nothing.
 */
export function validateSkillDraft(
  draft: SkillDraft,
): { ok: true } | { ok: false; reason: string } {
  if (!draft.key) return { ok: false, reason: "candidate has no stable key" };
  if (!draft.trigger) return { ok: false, reason: "candidate has no repeatable trigger" };
  if (!draft.insufficientRationale) {
    return {
      ok: false,
      reason: "candidate does not say why a test/instruction/task is insufficient",
    };
  }
  if (draft.externalWorkflow && !draft.externalWorkflowName) {
    return { ok: false, reason: "external workflow is not named" };
  }
  return { ok: true };
}

/** A filesystem-safe slug for a skill name (matches skills/<slug>/SKILL.md). */
export function skillSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "skill-suggestion";
}

/**
 * Normalize an arbitrary identity string into a canonical matching key. Unlike
 * `skillSlug`, an empty result stays empty (no placeholder) so callers can tell
 * "no usable key" from a real one.
 */
export function normalizeSkillKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Token-set similarity (Jaccard) between two procedure names, used as a last
 * resort when the model slugs the same procedure differently across sessions
 * ("audit-failing-build" vs "audit-a-failing-build"). Deliberately strict — a
 * false merge would corroborate an unrelated procedure.
 */
export function nameSimilarity(a: string, b: string): number {
  const tokenize = (v: string): Set<string> =>
    new Set(
      normalizeSkillKey(v)
        .split("-")
        .filter((t) => t.length > 2),
    );
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection += 1;
  const union = new Set([...A, ...B]).size;
  return intersection / union;
}

/** The canonical identity of a draft: its name, falling back to the model key. */
export function canonicalKeyOf(draft: Pick<SkillDraft, "key" | "name">): string {
  return normalizeSkillKey(draft.name) || normalizeSkillKey(draft.key);
}

/** The similarity threshold above which two names are treated as the same procedure. */
const NAME_MATCH_THRESHOLD = 0.8;

/**
 * Find the stored candidate that corresponds to `draft`, tolerating model drift
 * in the emitted key or name: exact canonical key, then an explicit alias, then
 * a strict name-similarity match.
 */
export function findCandidateRecord(
  records: SkillCandidateRecord[],
  draft: Pick<SkillDraft, "key" | "name">,
): SkillCandidateRecord | null {
  const canonical = canonicalKeyOf(draft);
  const modelKey = normalizeSkillKey(draft.key);
  const exact = records.find((r) => r.canonicalKey === canonical && canonical !== "");
  if (exact) return exact;
  const byAlias = records.find(
    (r) => r.key === draft.key || r.aliases.includes(modelKey) || r.aliases.includes(canonical),
  );
  if (byAlias) return byAlias;

  let best: SkillCandidateRecord | null = null;
  let bestScore = 0;
  for (const r of records) {
    const score = nameSimilarity(r.name, draft.name);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return bestScore >= NAME_MATCH_THRESHOLD ? best : null;
}

/**
 * The body of the suggestion task: the evidence, the human-readable spec, and
 * the draft. Every generated draft must state its evidence — the independent
 * source task ids (or the named stable external workflow), the repeatable
 * trigger, and why a test/instruction/task would be insufficient.
 */
export function buildSuggestionTaskBody(origin: Task, candidate: SkillCandidateRecord): string {
  const slug = skillSlug(candidate.name);
  const description = candidate.description || `Reusable procedure detected in task #${origin.id}.`;
  const sourceIds = candidate.sourceTaskIds.map((id) => `#${id}`).join(", ") || `#${origin.id}`;
  const evidence: string[] = [
    "## Evidence",
    "",
    `- **Independent source tasks:** ${sourceIds}`,
    `- **Repeatable trigger:** ${candidate.trigger}`,
    `- **Why a test, instruction, or task is not enough:** ${candidate.insufficientRationale}`,
  ];
  if (candidate.externalWorkflow) {
    evidence.push(`- **Stable external workflow:** ${candidate.externalWorkflowName}`);
  }
  evidence.push("");

  const parts: string[] = [
    "## Problem",
    "",
    `Completed task sessions (${sourceIds}) contain a reusable procedure that clears the`,
    `high bar for a skill: **${candidate.name}**.`,
    "",
    "This is an auto-generated suggestion. Nothing is live as a skill yet — approve it",
    "by turning the draft below into a skill file, or close this task to discard it.",
    "",
    ...evidence,
    "## Desired UX",
    "",
    `If the draft is worth keeping, create \`skills/${slug}/SKILL.md\` from it (edit`,
    "as needed) and close this task the normal way. If it is not, close it and",
    "discard the draft.",
    "",
    "## Draft skill (SKILL.md)",
    "",
    "```markdown",
    "---",
    `name: ${slug}`,
    `description: ${description}`,
    "---",
    "",
    candidate.body.trim(),
    "```",
    "",
  ];
  if (candidate.additional.length > 0) {
    parts.push(
      "## Other candidate procedures",
      "",
      "Identified in the same session but not turned into their own tasks (to avoid",
      "spam). Mentioned here only:",
      "",
      ...candidate.additional.map(
        (c) => `- **${c.name}**${c.description ? ` — ${c.description}` : ""}`,
      ),
      "",
    );
  }
  return parts.join("\n").trimEnd() + "\n";
}

/**
 * Write the origin→suggestion link into the originating task's frontmatter and
 * commit it. Mirrors the direct-frontmatter pattern `bumpReviewPasses` uses for
 * `review_passes` (a derived, non-modelled key preserved in `extra`).
 */
export function markOriginTask(config: RepoOSConfig, origin: Task, suggestionId: string): void {
  const raw = readFileSync(origin.absPath, "utf8");
  const doc = parseDocument(raw);
  doc.data[SKILL_SUGGESTION_KEY] = suggestionId;
  doc.data.updated_at = utcTimestamp();
  const keys = Object.keys(doc.data).filter(
    (k) => k !== SKILL_SUGGESTION_KEY && k !== "updated_at",
  );
  keys.unshift("updated_at", SKILL_SUGGESTION_KEY);
  writeFileSync(origin.absPath, serializeDocument(doc.data, `\n${doc.body}\n`, keys));
  commitTaskFile(
    config.root,
    origin.absPath,
    `docs(${origin.id}): note skill suggestion #${suggestionId}`,
  );
}

/** The result of one pass, for tests and logging. */
export interface SkillSuggestionRunResult {
  ok: boolean;
  suggestionId?: string;
  /** The candidate key, present whenever the analysis produced a candidate. */
  candidateKey?: string;
  /** Why no suggestion was created (or why one was). */
  reason?: string;
}

/**
 * Runs the evidence-gated skill-suggestion pass at most once per originating
 * task. All side effects are injected so the trigger site stays a one-liner and
 * the logic is unit-testable.
 */
export class SkillSuggestionManager {
  private readonly deps: SkillSuggestionDeps;
  private readonly store: SkillCandidateStore;
  /** Tasks with a pass in flight, so a re-entrant event doesn't double-run. */
  private readonly inFlight = new Set<string>();
  /**
   * Serializes every candidate-store read-modify-write. The critical section is
   * synchronous today (so the single-threaded JS runtime already makes it
   * atomic), but chaining through a promise makes that guarantee explicit and
   * keeps it true if an await is ever introduced — two tasks finishing at once
   * must never both see an empty store and both create a suggestion.
   */
  private writeChain: Promise<unknown> = Promise.resolve();

  constructor(deps: SkillSuggestionDeps) {
    this.deps = deps;
    const cacheDir = deps.config.cacheDir || ".repoos";
    this.store =
      deps.candidateStore ??
      new FileSkillCandidateStore(join(deps.config.root, cacheDir, CANDIDATE_STORE_FILE));
  }

  /** Whether the feature is on for this repo (off unless explicitly enabled). */
  enabled(): boolean {
    return this.deps.config.skillSuggestions === true;
  }

  /** Fire-and-forget entry point used by the done transition hook. */
  maybeSuggest(task: Task): void {
    void this.run(task).catch((err) => {
      this.deps.logger?.task(task.id, "warn", "skill-suggestion pass threw", {
        error: (err as Error).message,
      });
    });
  }

  /**
   * Run one pass. Never throws for expected conditions — returns `{ ok: false,
   * reason }` instead. Callers should rarely need the result; it exists for
   * tests and targeted diagnostics.
   */
  async run(task: Task): Promise<SkillSuggestionRunResult> {
    if (!this.enabled()) return { ok: false, reason: "disabled" };
    // Only a genuinely completed task has the verification evidence a skill
    // needs. The review transition is explicitly excluded (#0429).
    if (task.status !== "done") return { ok: false, reason: "task has not reached done" };
    if (typeof task.extra?.[SKILL_SUGGESTION_KEY] === "string") {
      return { ok: false, reason: "already suggested" };
    }
    if (this.inFlight.has(task.id)) return { ok: false, reason: "already running" };

    const transcript = transcriptToText(this.deps.getTranscript(task.id));
    if (!transcript) return { ok: false, reason: "no transcript to analyse" };

    this.inFlight.add(task.id);
    try {
      const agent = this.resolveAgent(task);
      if (!agent) return { ok: false, reason: "no agent available" };

      const mission = buildSkillSuggestionMission(task, transcript);
      const analyze =
        this.deps.analyze ??
        ((a: Agent, prompt: string, cwd: string) => runPrompt(a, prompt, { cwd }));
      const result = await analyze(agent, mission, this.deps.config.root);
      // Every LLM call must record its usage, even on failure.
      recordOneShotSession(this.deps.config.root, agent, result, {
        sessionType: "skill-suggestion",
        taskId: task.id,
      });
      if (!result.ok) return { ok: false, reason: result.error ?? "analysis failed" };

      const parsed = parseSkillSuggestion(extractOneShotReportText(agent.cli, result.output ?? ""));
      // Default to no suggestion: require an affirmative eligible verdict, an
      // allowed category, and a structurally complete draft.
      if (!parsed.eligible) {
        return { ok: false, reason: `rejected: ${parsed.rejectReason || parsed.category}` };
      }
      if (!ALLOWED_CATEGORIES.has(parsed.category)) {
        return { ok: false, reason: `rejected: ${parsed.category}` };
      }
      if (!parsed.skill) return { ok: false, reason: "no reusable procedure detected" };
      const valid = validateSkillDraft(parsed.skill);
      if (!valid.ok) return { ok: false, reason: `rejected: ${valid.reason}` };

      return this.serializeCandidateWrite(() => this.recordCandidate(task, parsed));
    } finally {
      this.inFlight.delete(task.id);
    }
  }

  /** Chain synchronous candidate-store work so writes never interleave. */
  private serializeCandidateWrite<T>(fn: () => T): Promise<T> {
    const next = this.writeChain.then(fn, fn);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  /**
   * Persist (or corroborate) one candidate. A first candidate is stored and
   * creates nothing; a suggestion is created only once corroboration exists.
   */
  private recordCandidate(task: Task, parsed: SkillSuggestionResult): SkillSuggestionRunResult {
    const draft = parsed.skill as SkillDraft;
    // Match against prior evidence tolerating model drift in the emitted key or
    // name ("audit-failing-build" vs "Audit a failing build"), so two sessions
    // for the same procedure actually corroborate each other.
    const existing = findCandidateRecord(this.store.all(), draft);
    const canonicalKey = existing?.canonicalKey || canonicalKeyOf(draft);
    const key = existing?.key || canonicalKey;
    if (existing?.suggestedTaskId) {
      return { ok: false, reason: "already suggested", candidateKey: key };
    }

    const sourceTaskIds = Array.from(new Set([...(existing?.sourceTaskIds ?? []), task.id]));
    const aliases = Array.from(
      new Set(
        [
          ...(existing?.aliases ?? []),
          normalizeSkillKey(draft.key),
          normalizeSkillKey(draft.name),
        ].filter(Boolean),
      ),
    );
    const now = utcTimestamp();
    const candidate: SkillCandidateRecord = {
      key,
      canonicalKey,
      aliases,
      name: draft.name,
      description: draft.description,
      body: draft.body,
      trigger: draft.trigger,
      insufficientRationale: draft.insufficientRationale,
      externalWorkflow: draft.externalWorkflow,
      externalWorkflowName: draft.externalWorkflowName,
      sourceTaskIds,
      additional: parsed.additional,
      firstSeenAt: existing?.firstSeenAt ?? now,
      updatedAt: now,
    };

    // Corroboration: at least two independent completed task sessions. A named
    // stable external workflow is additionally recorded as evidence, but does
    // NOT lift the two-session rule — per #0429, a single session must never
    // create a human inbox suggestion task.
    if (sourceTaskIds.length < 2) {
      if (!this.store.put(candidate)) {
        this.deps.logger?.task(task.id, "warn", "skill candidate could not be persisted", { key });
      }
      this.deps.logger?.task(
        task.id,
        "info",
        "skill candidate persisted (awaiting corroboration)",
        {
          key,
          sourceTaskIds,
        },
      );
      return { ok: false, reason: "awaiting corroboration", candidateKey: key };
    }

    const created = this.deps.createTask({
      title: `New Skill Suggestion: ${candidate.name}`,
      type: "spec",
      status: "inbox",
      assignedTo: "human",
      area: task.area || "general",
      body: buildSuggestionTaskBody(task, candidate),
    });
    if (!this.store.put({ ...candidate, suggestedTaskId: created.id })) {
      this.deps.logger?.task(task.id, "warn", "skill suggestion link could not be persisted", {
        key,
        suggestionId: created.id,
      });
    }
    this.deps.markOrigin(task, created.id);
    // Guard this in-memory task object too, so a re-entrant event for the same
    // task before its file is re-parsed doesn't run the analysis again.
    if (task.extra) task.extra[SKILL_SUGGESTION_KEY] = created.id;
    this.deps.logger?.task(task.id, "info", "skill suggestion created", {
      suggestionId: created.id,
      key,
      sourceTaskIds,
      externalWorkflow: candidate.externalWorkflowName || undefined,
    });
    return { ok: true, suggestionId: created.id, candidateKey: key, reason: "corroborated" };
  }

  /** Reviewer → engineer → PM, whichever is enabled first. */
  private resolveAgent(task: Task): Agent | null {
    return (
      resolveReviewerForTask(this.deps.config, task) ??
      resolveAgentForTask(this.deps.config, task) ??
      resolvePmAgent(this.deps.config)
    );
  }
}
