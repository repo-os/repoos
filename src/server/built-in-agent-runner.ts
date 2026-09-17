/**
 * Shared skill-guided built-in agent runner.
 *
 * Provides a single invocation path for converting deterministic built-in
 * agents (Tech Debt, Performance, Architect, Design, Docs Debt) into real
 * AI-driven agents. Each agent is driven by a skill/guidance doc that
 * describes what the agent's concern actually means, given the real repo as
 * context, and produces structured findings compatible with today's
 * `TrivialFix`/`Finding`-style types so downstream task-creation code
 * doesn't need to change per-agent.
 *
 * This module is infrastructure only — it does not migrate any individual
 * agent. It reuses `AgentRunner`/`runPrompt` and the existing
 * `BuiltInAgentConfig` schema (enabled/schedule/cli/model/lastRunAt).
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BuiltInAgentConfig, RepoOSConfig } from "../core/types.js";
import { saveBuiltInAgentsConfig } from "../core/config.js";
import {
  runPrompt,
  recordOneShotSession,
  extractOneShotReportText,
  type PromptResult,
} from "./agents.js";
import type { Logger } from "../core/logger.js";

// ── Finding types (compatible with existing built-in agent output shapes) ──

/** Severity shared across all finding types. */
export type FindingSeverity = "high" | "medium" | "low";

/** A single structured finding produced by a skill-guided agent run. */
export interface SkillGuidedFinding {
  /** Agent-specific issue type (e.g. "missing-path", "outdated-dependency"). */
  type: string;
  /** Repo-relative path of the affected file, if applicable. */
  file?: string;
  /** Line number in the affected file, if applicable. */
  line?: number;
  /** Human-readable description of the finding. */
  description: string;
  /** Severity level. */
  severity: FindingSeverity;
  /** Agent-specific recommendation, if applicable. */
  recommendation?: string;
}

/** A proposed fix that may be eligible for auto-commit via the verification gate. */
export interface SkillGuidedFix {
  /** Repo-relative path of the file to edit. */
  doc: string;
  /** Exact text currently in the file. */
  oldText: string;
  /** Proposed replacement text. */
  newText: string;
  /** Evidence supporting why this fix is correct. */
  evidence: string;
}

/** Result of a skill-guided agent run. */
export interface SkillGuidedRunResult {
  /** Whether the LLM invocation succeeded. */
  ok: boolean;
  /** Structured findings from the agent. */
  findings: SkillGuidedFinding[];
  /** Proposed fixes eligible for the auto-fix gate. */
  fixes: SkillGuidedFix[];
  /** The raw LLM report text. */
  report: string;
  /** Error message if the run failed. */
  error?: string;
  /** Duration in milliseconds. */
  elapsedMs?: number;
  /** Token usage from the LLM call. */
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  costUsd?: number;
}

// ── Agent resolution ──

/** Default CLI when the built-in agent config doesn't specify one. */
const DEFAULT_CLI = "opencode";

/** Default model when the built-in agent config doesn't specify one. */
const DEFAULT_MODEL = "default";

/** Timeout for a single skill-guided agent run (5 minutes). */
const SKILL_GUIDED_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Construct an `Agent`-shaped object from a built-in agent's name and
 * config. The `Agent` type is what `runPrompt` expects, so we bridge
 * from the lighter `BuiltInAgentConfig` to it.
 */
function agentFromBuiltInConfig(
  name: string,
  config: BuiltInAgentConfig,
): { name: string; cli: string; model: string; enabled: boolean } {
  return {
    name,
    cli: config.cli ?? DEFAULT_CLI,
    model: config.model ?? DEFAULT_MODEL,
    enabled: config.enabled !== false,
  };
}

// ── Prompt construction ──

/**
 * Build the prompt sent to the LLM. Includes:
 * 1. The skill/guidance doc (what this agent's concern means)
 * 2. Repository context (file tree, relevant manifests)
 * 3. Instructions for structured JSON output
 */
function buildSkillGuidedPrompt(agentName: string, skillDoc: string, repoContext: string): string {
  return [
    `You are the ${agentName} agent for this repository.`,
    "",
    "## Your role",
    "",
    skillDoc,
    "",
    "## Repository context",
    "",
    repoContext,
    "",
    "## Output format",
    "",
    "Produce a JSON array of findings. Each finding must be a JSON object with these fields:",
    '- `type` (string): The issue type (e.g. "missing-path", "outdated-dependency", "slow-function").',
    "- `file` (string, optional): Repo-relative path of the affected file.",
    "- `line` (number, optional): Line number in the affected file.",
    "- `description` (string): Human-readable description of the finding.",
    '- `severity` (string): "high", "medium", or "low".',
    "- `recommendation` (string, optional): What should be done about this.",
    "",
    "If you also propose specific fixes, include a `fixes` array at the top level with objects containing:",
    "- `doc` (string): Repo-relative path of the file to edit.",
    "- `oldText` (string): Exact text currently in the file.",
    "- `newText` (string): Proposed replacement.",
    "- `evidence` (string): Why this fix is correct.",
    "",
    "Return ONLY the JSON object — no markdown fences, no explanation.",
    'If you find no issues, return `{ "findings": [], "fixes": [] }`.',
  ].join("\n");
}

// ── Repo context gathering ──

/**
 * Gather lightweight repo context for the LLM prompt: file tree, key
 * manifests, and skill doc content. This is bounded to avoid sending
 * the entire repo to the model.
 */
export function gatherRepoContext(repoRoot: string): string {
  const lines: string[] = [];

  // File tree (top-level + one level deep)
  try {
    const topLevel = readdirSync(repoRoot, { withFileTypes: true });
    const dirs: string[] = [];
    const files: string[] = [];
    for (const entry of topLevel) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      if (entry.isDirectory()) {
        dirs.push(entry.name);
      } else {
        files.push(entry.name);
      }
    }
    lines.push("## Top-level structure");
    lines.push(`Directories: ${dirs.join(", ") || "(none)"}`);
    lines.push(`Files: ${files.join(", ") || "(none)"}`);
    lines.push("");
  } catch {
    lines.push("## Top-level structure");
    lines.push("(unable to read directory)");
    lines.push("");
  }

  // package.json summary
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    lines.push("## package.json");
    if (pkg.name) lines.push(`Name: ${pkg.name}`);
    if (pkg.description) lines.push(`Description: ${pkg.description}`);
    if (pkg.scripts) {
      const scriptNames = Object.keys(pkg.scripts).slice(0, 20);
      lines.push(`Scripts: ${scriptNames.join(", ")}`);
    }
    if (pkg.dependencies) {
      const depCount = Object.keys(pkg.dependencies).length;
      lines.push(`Dependencies: ${depCount} runtime`);
    }
    lines.push("");
  } catch {
    // no package.json — skip
  }

  return lines.join("\n");
}

// ── Response parsing ──

/**
 * Parse the LLM's JSON response into structured findings and fixes.
 * Handles both the `{ findings, fixes }` wrapper and a bare array.
 * Falls back to treating the whole report as a single finding on parse failure.
 */
function parseAgentResponse(reportText: string): {
  findings: SkillGuidedFinding[];
  fixes: SkillGuidedFix[];
} {
  const trimmed = reportText.trim();
  if (!trimmed) return { findings: [], fixes: [] };

  // Try to extract JSON from the report (may be wrapped in markdown fences)
  let jsonStr = trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    // Handle { findings, fixes } wrapper
    if (parsed && typeof parsed === "object" && Array.isArray(parsed.findings)) {
      return {
        findings: parsed.findings.map(normalizeFinding),
        fixes: Array.isArray(parsed.fixes) ? parsed.fixes.map(normalizeFix) : [],
      };
    }
    // Handle bare array
    if (Array.isArray(parsed)) {
      return {
        findings: parsed.map(normalizeFinding),
        fixes: [],
      };
    }
  } catch {
    // JSON parse failed — fall through to fallback
  }

  // Fallback: treat the entire report as a single finding
  return {
    findings: [
      {
        type: "agent-report",
        description: trimmed.slice(0, 500),
        severity: "medium",
      },
    ],
    fixes: [],
  };
}

function normalizeFinding(raw: unknown): SkillGuidedFinding {
  if (!raw || typeof raw !== "object") {
    return { type: "unknown", description: String(raw), severity: "medium" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    type: typeof obj.type === "string" ? obj.type : "unknown",
    file: typeof obj.file === "string" ? obj.file : undefined,
    line: typeof obj.line === "number" ? obj.line : undefined,
    description: typeof obj.description === "string" ? obj.description : "",
    severity: isValidSeverity(obj.severity) ? obj.severity : "medium",
    recommendation: typeof obj.recommendation === "string" ? obj.recommendation : undefined,
  };
}

function normalizeFix(raw: unknown): SkillGuidedFix {
  if (!raw || typeof raw !== "object") {
    return { doc: "", oldText: "", newText: "", evidence: "" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    doc: typeof obj.doc === "string" ? obj.doc : "",
    oldText: typeof obj.oldText === "string" ? obj.oldText : "",
    newText: typeof obj.newText === "string" ? obj.newText : "",
    evidence: typeof obj.evidence === "string" ? obj.evidence : "",
  };
}

function isValidSeverity(value: unknown): value is FindingSeverity {
  return value === "high" || value === "medium" || value === "low";
}

// ── Main runner ──

/**
 * Run a skill-guided built-in agent. This is the shared entry point that
 * all migrated built-in agents will use.
 *
 * @param agentName   The agent's role name (e.g. "tech-debt", "docs-debt").
 * @param config      Global RepoOS config (provides builtInAgents settings).
 * @param skillDoc    Content of the skill/guidance doc for this agent.
 * @param skillDocPath  Repo-relative path to the skill doc (for context).
 * @param logger      Optional logger for structured output.
 * @returns           Structured findings and proposed fixes.
 */
export async function runSkillGuidedAgent(
  agentName: string,
  config: RepoOSConfig,
  skillDoc: string,
  skillDocPath?: string,
  logger?: Logger,
): Promise<SkillGuidedRunResult> {
  const agentConfig = config.builtInAgents?.[agentName];
  if (!agentConfig) {
    return {
      ok: false,
      findings: [],
      fixes: [],
      report: "",
      error: `No built-in agent config found for "${agentName}"`,
    };
  }

  if (agentConfig.enabled === false) {
    return {
      ok: false,
      findings: [],
      fixes: [],
      report: "",
      error: `Built-in agent "${agentName}" is disabled`,
    };
  }

  const agent = agentFromBuiltInConfig(agentName, agentConfig);
  logger?.agent(agentName, "info", `Skill-guided agent run started`);

  // Gather repo context
  const repoContext = gatherRepoContext(config.root);

  // Build prompt
  const prompt = buildSkillGuidedPrompt(agentName, skillDoc, repoContext);

  // Invoke the LLM
  let result: PromptResult;
  try {
    result = await runPrompt(agent, prompt, {
      cwd: config.root,
      timeoutMs: SKILL_GUIDED_TIMEOUT_MS,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const msg = `Built-in agent "${agentName}": invocation failed — ${error}`;
    logger?.agent(agentName, "error", msg);
    return {
      ok: false,
      findings: [],
      fixes: [],
      report: "",
      error: msg,
    };
  }

  // Record usage per AGENTS.md
  recordOneShotSession(config.root, agent, result, {
    sessionType: `built-in:${agentName}`,
    taskId: null,
  });

  if (!result.ok) {
    const error = result.error ?? "unknown error";
    const msg = `Built-in agent "${agentName}": run failed — ${error}`;
    logger?.agent(agentName, "error", msg);
    return {
      ok: false,
      findings: [],
      fixes: [],
      report: "",
      error: msg,
      elapsedMs: result.elapsedMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
      costUsd: result.costUsd,
    };
  }

  // Extract report text from CLI output
  const reportText = extractOneShotReportText(agent.cli, result.output ?? "");

  // Parse into structured findings
  const { findings, fixes } = parseAgentResponse(reportText);

  logger?.agent(agentName, "info", `Skill-guided agent run completed`, {
    findingsCount: findings.length,
    fixesCount: fixes.length,
  });

  return {
    ok: true,
    findings,
    fixes,
    report: reportText,
    elapsedMs: result.elapsedMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.totalTokens,
    costUsd: result.costUsd,
  };
}

/**
 * Save the lastRunAt timestamp for a built-in agent after a successful run.
 * Matches the pattern used by the existing deterministic agents.
 */
export function saveLastRunAt(repoRoot: string, agentName: string, config: RepoOSConfig): void {
  const agents = { ...(config.builtInAgents ?? {}) };
  agents[agentName] = {
    ...(agents[agentName] ?? {}),
    lastRunAt: new Date().toISOString(),
  };
  saveBuiltInAgentsConfig(repoRoot, agents, config.cacheDir);
  config.builtInAgents = agents;
}
