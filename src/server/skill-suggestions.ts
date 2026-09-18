/**
 * Auto-suggest reusable skills from completed sessions (#0405).
 *
 * When a task lands in `review` (or `done`, when review was skipped) its
 * session transcript is analysed once. If a non-trivial, reusable multi-step
 * procedure is detected, exactly ONE `New Skill Suggestion: <name>` task of
 * type `spec` is created through the normal task-creation path so a human can
 * review the draft. Nothing is ever written as a live skill file here — the
 * suggestion is a normal board task the human works the usual way.
 *
 * Design notes:
 *   - On by default, toggled by the `skillSuggestions` config key; off means
 *     the pass is a complete no-op (no task, no marker, no drawer note).
 *   - At most one suggestion task per originating task. Extra candidates are
 *     listed inside the single suggestion body, never turned into more tasks.
 *   - The analysis runs through the same one-shot LLM path the other server
 *     roles use (`runPrompt`), and its spend is recorded in the sessions table
 *     with `sessionType: "skill-suggestion"` and the originating taskId.
 *   - Best-effort: a failure (no agent, bad JSON, timeout) creates nothing and
 *     never surfaces an error to the task's normal flow.
 *
 * Zero runtime deps — node:fs / node:path only.
 */
import { readFileSync, writeFileSync } from "node:fs";
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

/** Cap on the task spec quoted into the analysis prompt (keeps it bounded). */
const SPEC_CHARS = 4000;

/** Cap on the session transcript quoted into the analysis prompt. */
const TRANSCRIPT_CHARS = 30_000;

/** Cap on a generated draft body, so a runaway model cannot blow up a task file. */
const SKILL_BODY_CHARS = 12_000;

/** A parsed draft skill, ready to render as SKILL.md. */
export interface SkillDraft {
  /** Human-readable procedure name, e.g. "Snapshot a failing test run". */
  name: string;
  /** One sentence describing when to use the skill. */
  description: string;
  /** The SKILL.md body (markdown, without frontmatter). */
  body: string;
}

/** A secondary candidate that is mentioned but never given its own task. */
export interface SkillCandidate {
  name: string;
  description: string;
}

export interface SkillSuggestionResult {
  /** The primary draft, or null when no reusable procedure was detected. */
  skill: SkillDraft | null;
  /** Other candidates, mentioned only — never separate tasks. */
  additional: SkillCandidate[];
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
    "You analyse a completed RepoOS task session and decide whether it contained a",
    "non-trivial, reusable multi-step procedure worth capturing as a reusable skill.",
    "A skill is a procedure that would help another agent on a FUTURE, DIFFERENT task:",
    "a repeatable workflow, a sequence of commands, a diagnostic method. One-off edits,",
    "this task's specific content, and trivial actions are NOT skills.",
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
    '{ "skill": { "name": "Short procedure name",',
    '              "description": "One sentence on when to use it.",',
    '              "body": "The full SKILL.md markdown body, no frontmatter." } | null,',
    '  "additional": [ { "name": "...", "description": "..." } ] }',
    "",
    'Set "skill" to null when no non-trivial reusable procedure was performed.',
    '"additional" lists any other candidates (name + description only); it may be empty.',
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

/**
 * Parse the analysis agent's answer into a validated result. Forgiving: a
 * malformed answer yields `{ skill: null }` (nothing created), never a throw.
 */
export function parseSkillSuggestion(raw: string): SkillSuggestionResult {
  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return { skill: null, additional: [] };
  const obj = parsed as Record<string, unknown>;

  let skill: SkillDraft | null = null;
  const rawSkill = obj.skill;
  if (rawSkill && typeof rawSkill === "object") {
    const s = rawSkill as Record<string, unknown>;
    const name = asString(s.name);
    const body = asString(s.body).slice(0, SKILL_BODY_CHARS);
    if (name && body) {
      skill = { name, description: asString(s.description), body };
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

  return { skill, additional };
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

/** The body of the suggestion task: the human-readable spec plus the draft. */
export function buildSuggestionTaskBody(
  origin: Task,
  skill: SkillDraft,
  additional: SkillCandidate[],
): string {
  const slug = skillSlug(skill.name);
  const description = skill.description || `Reusable procedure detected in task #${origin.id}.`;
  const parts: string[] = [
    "## Problem",
    "",
    `Task #${origin.id} (${origin.title}) completed a session that appears to contain a`,
    `non-trivial, reusable procedure: **${skill.name}**.`,
    "",
    "This is an auto-generated suggestion from that session. Nothing is live as a",
    "skill yet — approve it by turning the draft below into a skill file.",
    "",
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
    skill.body.trim(),
    "```",
    "",
  ];
  if (additional.length > 0) {
    parts.push(
      "## Other candidate procedures",
      "",
      "Identified in the same session but not turned into their own tasks (to avoid",
      "spam). Mentioned here only:",
      "",
      ...additional.map((c) => `- **${c.name}**${c.description ? ` — ${c.description}` : ""}`),
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
  reason?: string;
}

/**
 * Runs the skill-suggestion pass at most once per originating task. All side
 * effects are injected so the trigger site stays a one-liner and the logic is
 * unit-testable.
 */
export class SkillSuggestionManager {
  private readonly deps: SkillSuggestionDeps;
  /** Tasks with a pass in flight, so rapid review→done transitions don't double-run. */
  private readonly inFlight = new Set<string>();

  constructor(deps: SkillSuggestionDeps) {
    this.deps = deps;
  }

  /** Whether the feature is on for this repo (default true when unset). */
  enabled(): boolean {
    return this.deps.config.skillSuggestions !== false;
  }

  /** Fire-and-forget entry point used by the status-transition hook. */
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
      if (!parsed.skill) return { ok: false, reason: "no reusable procedure detected" };

      const created = this.deps.createTask({
        title: `New Skill Suggestion: ${parsed.skill.name}`,
        type: "spec",
        status: "inbox",
        assignedTo: "human",
        area: task.area || "general",
        body: buildSuggestionTaskBody(task, parsed.skill, parsed.additional),
      });
      this.deps.markOrigin(task, created.id);
      this.deps.logger?.task(task.id, "info", "skill suggestion created", {
        suggestionId: created.id,
      });
      return { ok: true, suggestionId: created.id };
    } finally {
      this.inFlight.delete(task.id);
    }
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
