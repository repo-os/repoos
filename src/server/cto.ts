/**
 * The CTO agent (0174): an always-on board monitor that detects stuck tasks,
 * stale reviews, and broken builds, then nudges agents and escalates to the human.
 *
 * Similar to ReviewManager but with a monitor loop and guard-railed actions.
 * The CTO can send messages to task sessions, run repoos check, move tasks
 * between statuses (with strict conditions), and create follow-up bugs.
 * It never moves a task to done, merges, deletes, changes config, or modifies
 * files outside the repo.
 *
 * Zero runtime deps — node:fs / node:path only.
 */
import type { ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { Agent, AgentOutputEntry, RepoOSConfig, Task } from "../core/types.js";
import { parseDocument, serializeDocument } from "../core/frontmatter.js";
import { commitTaskFile, currentBranch, worktreePathForBranch } from "../core/git.js";
import { parseTask, serializeTask, recordChange } from "../core/task.js";
import type { RepoEvent } from "./live-index.js";
import {
  extractOneShotReportText,
  parseOneShotLine,
  resolveCto,
  runPrompt,
  reviewCommand,
  usageCostSource,
  type AgentRunner,
  type PromptResult,
} from "./agents.js";
import { getRepoOSDb, type RepoOSDb } from "../core/db.js";
import { patchTaskFile } from "./write.js";

export interface CTOReport {
  id: string;
  at: string;
  agent: string;
  cli: string;
  model: string;
  state: "ok" | "failed";
  markdown: string;
}

const REPORT_CHARS = 20_000;
const SESSION_LINES_CAP = 2000;
const SESSION_WRITE_DEBOUNCE_MS = 300;
const CTO_SESSION_ID_PREFIX = "cto:";
const CTO_TIMEOUT_MS = 300_000; // 5 minutes
const REPORT_KEYS = ["at", "agent", "cli", "model", "state"];

const now = (): string => new Date().toISOString();

export function ctoMission(config: RepoOSConfig, agent: Agent, boardDigest: string): string {
  const role = agent.instructions?.trim();
  const parts: string[] = [];
  if (role) parts.push(role, "");
  parts.push(
    "You are monitoring the RepoOS board. Below is a digest of current state:",
    "- Tasks by status and staleness",
    "- Stuck signals (handoff requested but no done, active with idle session, stale review)",
    "- Serve processes and build freshness",
    "",
    "## Board digest",
    "",
    boardDigest,
    "",
    "## What to do",
    "",
    "1. Read the digest and identify real problems (not false positives).",
    "2. For each problem, decide: ignore (healthy), nudge (send a message), escalate",
    "   (set needs_input), or file a follow-up bug.",
    "3. Output a concise status report (under 300 words). List what you found and what",
    "   you're doing about it. NO CHATTER when nothing is wrong — silent is golden.",
    "",
    "## Hard boundaries",
    "",
    "- Do NOT edit, create, or delete any file outside this repo.",
    "- Do NOT commit, push, merge, or delete branches.",
    "- Do NOT move a task to 'done'.",
    "- Do NOT spend money or change config.",
    "- Do NOT run servers or long-lived processes.",
    "- The monitor may send one standard completion nudge to an active engineer after",
    "  five minutes with no worktree activity. It records and announces that nudge.",
    "- Ask the human before every other action (set needs_input, file a bug, or any",
    "  task/status change).",
    "- Keep nudges rare and brief. A task is only nudged once per digest unless",
    "  new information arrives.",
    "",
    "## Output format",
    "",
    "Output ONLY the report as markdown, with no preamble:",
    "- Title (one line): what you found (e.g., '2 stuck tasks, 1 stale review')",
    "- What you found (bullet points)",
    "- What you're doing (bullet points)",
    "- Write 'Nothing to report' if the board is healthy.",
  );
  return parts.join("\n");
}

interface Run {
  proc?: ChildProcess;
  cancelled: boolean;
}

export class CTOManager {
  private readonly config: RepoOSConfig;
  private readonly emit: (e: RepoEvent) => void;
  private readonly runs = new Map<string, Run>();
  private readonly sessions = new Map<string, AgentOutputEntry[]>();
  private readonly sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly runner?: AgentRunner;
  /** Database for recording CTO sessions (0230). */
  private readonly db: RepoOSDb | null;

  constructor(config: RepoOSConfig, emit: (e: RepoEvent) => void, runner?: AgentRunner) {
    this.config = config;
    this.emit = emit;
    this.runner = runner;
    this.db = getRepoOSDb(config.root);
  }

  enabled(): boolean {
    return resolveCto(this.config) !== null;
  }

  isRunning(): boolean {
    return this.runs.size > 0;
  }

  runningCount(): number {
    return this.runs.size;
  }

  path(): string {
    return join(this.config.root, this.config.cacheDir, "cto", "report.md");
  }

  read(): CTOReport | null {
    const file = this.path();
    if (!existsSync(file)) return null;
    let raw: string;
    try {
      raw = readFileSync(file, "utf8");
    } catch {
      return null;
    }
    const doc = parseDocument(raw);
    const str = (key: string): string => {
      const v = doc.data[key];
      return v === null || v === undefined ? "" : String(v);
    };
    return {
      id: "cto",
      at: str("at"),
      agent: str("agent"),
      cli: str("cli"),
      model: str("model"),
      state: str("state") === "failed" ? "failed" : "ok",
      markdown: doc.body.trim(),
    };
  }

  canRun(): { ok: boolean; reason?: string } {
    if (this.runs.size > 0) {
      return { ok: false, reason: "a CTO run is already in progress" };
    }
    const agent = resolveCto(this.config);
    if (!agent) {
      return { ok: false, reason: "the CTO agent is disabled on the Agents page" };
    }
    return { ok: true };
  }

  async run(boardDigest: string): Promise<{ ok: boolean; reason?: string; report?: CTOReport }> {
    if (this.runs.size > 0) {
      return { ok: false, reason: "a CTO run is already in progress" };
    }
    const agent = resolveCto(this.config);
    if (!agent) {
      return { ok: false, reason: "the CTO agent is disabled" };
    }

    this.resetSession();

    const run: Run = { cancelled: false };
    this.runs.set("cto", run);
    this.emit({ type: "cto", state: "running", at: now() });
    this.appendMarker(`CTO monitoring started — ${agent.name} (${agent.cli})`);

    const mission = ctoMission(this.config, agent, boardDigest);
    let result;
    try {
      result = await runPrompt(agent, mission, {
        cwd: this.config.root,
        timeoutMs: CTO_TIMEOUT_MS,
        command: reviewCommand(agent, mission, this.config.root),
        onSpawn: (proc) => {
          run.proc = proc;
          if (run.cancelled) proc.kill("SIGTERM");
        },
        onLine: (line) => this.appendSessionLine(agent.cli, line),
      });
    } finally {
      this.runs.delete("cto");
    }

    if (run.cancelled) {
      this.emit({ type: "cto", state: "cancelled", at: now() });
      return { ok: false, reason: "CTO run cancelled" };
    }

    const state: CTOReport["state"] = result.ok && result.output ? "ok" : "failed";
    const body =
      state === "ok"
        ? extractOneShotReportText(agent.cli, result.output ?? "")
        : `The CTO produced no report: ${result.error ?? "unknown error"}`;
    const report: CTOReport = {
      id: "cto",
      at: now(),
      agent: agent.name,
      cli: agent.cli,
      model: agent.model,
      state,
      markdown: body.slice(0, REPORT_CHARS),
    };
    this.write(report);
    this.appendMarker(
      state === "ok" ? "✓ CTO monitoring complete" : `✗ CTO run failed: ${result.error ?? "no report"}`,
    );
    this.persistSession();
    this.recordRun(agent, result, report.at, state === "ok");
    this.emit({
      type: "cto",
      state: state === "ok" ? "ready" : "failed",
      at: report.at,
      ...(state === "failed" ? { error: result.error } : {}),
    });

    return state === "ok"
      ? { ok: true, report }
      : { ok: false, reason: result.error ?? "the CTO agent failed", report };
  }

  async send(text: string): Promise<{ ok: boolean; reason?: string }> {
    if (this.runs.size > 0) {
      return { ok: false, reason: "a CTO run is already in progress" };
    }
    const agent = resolveCto(this.config);
    if (!agent) {
      return { ok: false, reason: "the CTO agent is disabled" };
    }

    if (!this.hasSession()) {
      this.sessions.set("cto", []);
    }
    this.appendEntry({ type: "human", text });

    const run: Run = { cancelled: false };
    this.runs.set("cto", run);
    this.emit({ type: "cto", state: "running", at: now() });

    const mission = `You are the CTO. Respond to this question about the board and the tasks:\n\n${text}`;
    let result;
    try {
      result = await runPrompt(agent, mission, {
        cwd: this.config.root,
        timeoutMs: CTO_TIMEOUT_MS,
        command: reviewCommand(agent, mission, this.config.root),
        onSpawn: (proc) => {
          run.proc = proc;
          if (run.cancelled) proc.kill("SIGTERM");
        },
        onLine: (line) => this.appendSessionLine(agent.cli, line),
      });
    } finally {
      this.runs.delete("cto");
    }

    if (run.cancelled) {
      this.emit({ type: "cto", state: "cancelled", at: now() });
      return { ok: false, reason: "CTO run cancelled" };
    }

    if (!result.ok) {
      this.appendMarker(`✗ the CTO could not answer: ${result.error ?? "unknown error"}`);
      this.persistSession();
      this.recordRun(agent, result, now(), false);
      this.emit({ type: "cto", state: "failed", at: now() });
      return { ok: false, reason: result.error ?? "the CTO failed to answer" };
    }

    const completedAt = now();
    this.persistSession();
    this.recordRun(agent, result, completedAt, true);
    this.emit({ type: "cto", state: "ready", at: completedAt });
    return { ok: true };
  }

  session(): AgentOutputEntry[] {
    const lines = this.sessions.get("cto");
    if (lines) return lines;
    const loaded = this.readSession();
    return loaded ?? [];
  }

  cancel(): void {
    const run = this.runs.get("cto");
    if (!run) return;
    run.cancelled = true;
    try {
      run.proc?.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }

  cancelAll(): void {
    this.cancel();
  }

  // ---- Guard-railed actions ----

  /**
   * Send a message to a task's agent session (nudge or escalation).
   * The caller records any automatic nudge separately so it is visible to the
   * human in the task activity feed.
   */
  sendTaskMessage(taskId: string, message: string, agent: Agent | null): boolean {
    if (!this.runner || !agent) return false;
    try {
      return this.runner.send(taskId, message, agent).ok;
    } catch {
      return false;
    }
  }

  /**
   * Persist and announce the one automatic action the CTO monitor may take:
   * a completion reminder to an idle active engineer. Keeping this separate
   * from `sendTaskMessage` makes the human-facing audit entry durable even
   * when the agent transcript is later compacted or the server reloads.
   */
  recordAutomaticNudge(task: Task): boolean {
    try {
      const current = parseTask({
        content: readFileSync(task.absPath, "utf8"),
        absPath: task.absPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });
      if (current.status !== "active") return false;

      const note = "CTO nudge: sent engineer a completion reminder after 5m without worktree activity";
      recordChange(current, note);
      writeFileSync(task.absPath, serializeTask(current));
      commitTaskFile(this.config.root, task.absPath, `docs(${current.id}): record CTO nudge`);
      this.appendMarker(`↗ CTO nudged engineer for #${current.id} after 5m idle — human notified`);
      this.emit({ type: "task.corrected", id: current.id, path: current.path, note, at: now() });
      return true;
    } catch (err) {
      console.error(`[repoos] CTO: failed to record nudge for #${task.id}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Run repoos check on a task's worktree to verify it passes before
   * taking automatic actions. Returns true if check passes, false otherwise.
   */
  runRepoosCheck(workdir: string): boolean {
    try {
      execSync("repoos check", { cwd: workdir, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Move a task from review to active (or mark needs_input) when genuinely stuck.
   * Only call this after human confirmation or verification that the task is
   * actually stuck (not just slow). The action is logged to task activity.
   */
  moveTaskStatus(taskAbsPath: string, fromStatus: string, toStatus: string, reason: string): boolean {
    try {
      const content = readFileSync(taskAbsPath, "utf8");
      const task = parseTask({
        content,
        absPath: taskAbsPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });

      if (task.status !== fromStatus) {
        return false; // Status changed since check
      }

      // Guard: never move to 'done'
      if (toStatus === "done") {
        return false;
      }

      // Record the change and update
      recordChange(task, `CTO action: ${reason}`);
      task.status = toStatus as any;
      writeFileSync(taskAbsPath, serializeTask(task));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set needs_input flag on a task to escalate to human review.
   * This surfaces the task in the UI and fires notifications.
   */
  setNeedsInput(taskAbsPath: string, reason: string): boolean {
    try {
      const content = readFileSync(taskAbsPath, "utf8");
      const task = parseTask({
        content,
        absPath: taskAbsPath,
        root: this.config.root,
        defaultStatus: this.config.defaultStatus,
        defaultAssignee: this.config.defaultAssignee,
      });

      if (task.needsInput) {
        return true; // Already set
      }

      recordChange(task, `CTO action: ${reason}`);
      task.needsInput = true;
      writeFileSync(taskAbsPath, serializeTask(task));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a follow-up bug task for systemic issues detected by the CTO.
   * Returns the new task id on success, null on failure.
   */
  createFollowUpBug(title: string, body: string, area: string): string | null {
    try {
      const workDir = join(this.config.root, this.config.workDir);
      let maxId = 0;
      const files = readdirSync(workDir);
      for (const file of files) {
        const m = file.match(/^(\d+)/);
        if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
      }

      const nextId = String(maxId + 1).padStart(4, "0");
      const filename = `${nextId}-${title.toLowerCase().replace(/\s+/g, "-")}.md`;
      const filePath = join(workDir, filename);

      const now = new Date().toISOString();
      const content = `---
id: "${nextId}"
title: "${title}"
type: "bug"
status: "inbox"
priority: "p2"
area: "${area}"
assigned_to: "unassigned"
created_at: "${now}"
updated_at: "${now}"
---
## Problem
Created by CTO monitoring (0174): ${title}

## Context
${body}

## Activity
- ${now} · created · CTO`;

      writeFileSync(filePath, content, "utf8");
      return nextId;
    } catch {
      return null;
    }
  }

  // ---- private methods ----

  /**
   * Record a CTO run to the database (0230). Persisted with the cto session
   * type, real wall-clock elapsed time, and any CLI-reported tokens/cost.
   * Best-effort — never crashes the monitor.
   */
  private recordRun(agent: Agent, result: PromptResult, completedAt: string, success: boolean): void {
    if (!this.db) return;
    try {
      const sessionId = `cto:${completedAt}`;
      const elapsedMs = result.elapsedMs ?? 0;
      const costSource = usageCostSource(agent, result);
      this.db.upsertSession({
        sessionId,
        sessionType: "cto",
        taskId: null, // CTO observes the whole board, not one task
        agent: agent.name,
        model: agent.model,
        codingAgent: agent.cli,
        startedAt: new Date(Date.parse(completedAt) - elapsedMs).toISOString(),
        endedAt: completedAt,
        elapsedMs,
        inputTokens: result.inputTokens ?? undefined,
        outputTokens: result.outputTokens ?? undefined,
        totalTokens: result.totalTokens ?? undefined,
        costUsd: result.costUsd ?? undefined,
        costSource,
        status: success ? "finished" : "errored",
        lastActivityAt: completedAt,
      });
    } catch {
      // Database recording is best-effort and must never crash.
    }
  }

  private sessionId(): string {
    return `${CTO_SESSION_ID_PREFIX}board`;
  }

  private hasSession(): boolean {
    if (this.sessions.has("cto")) return true;
    const file = this.sessionFile();
    return file !== null && existsSync(file);
  }

  private sessionFile(): string | null {
    return join(this.config.root, this.config.cacheDir, "cto", "session.json");
  }

  private readSession(): AgentOutputEntry[] | null {
    const file = this.sessionFile();
    if (!file || !existsSync(file)) return null;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as { lines?: unknown };
      if (!Array.isArray(parsed.lines)) return null;
      const lines = parsed.lines as AgentOutputEntry[];
      this.sessions.set("cto", lines.slice(-SESSION_LINES_CAP));
      return lines;
    } catch {
      return null;
    }
  }

  private persistSession(): void {
    const timer = this.sessionTimers.get("cto");
    if (timer) clearTimeout(timer);
    this.sessionTimers.delete("cto");
    const lines = this.sessions.get("cto");
    const file = this.sessionFile();
    if (!lines || !file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
      try {
        writeFileSync(temp, JSON.stringify({ lines }, null, 2), "utf8");
        renameSync(temp, file);
      } finally {
        if (existsSync(temp)) unlinkSync(temp);
      }
    } catch {
      /* best-effort */
    }
  }

  private scheduleSessionWrite(): void {
    const existing = this.sessionTimers.get("cto");
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.persistSession(), SESSION_WRITE_DEBOUNCE_MS);
    timer.unref?.();
    this.sessionTimers.set("cto", timer);
  }

  private resetSession(): void {
    const timer = this.sessionTimers.get("cto");
    if (timer) {
      clearTimeout(timer);
      this.sessionTimers.delete("cto");
    }
    this.sessions.delete("cto");
    const file = this.sessionFile();
    if (file) {
      try {
        if (existsSync(file)) unlinkSync(file);
      } catch {
        /* best-effort */
      }
    }
  }

  private appendEntry(entry: AgentOutputEntry): void {
    let lines = this.sessions.get("cto");
    if (!lines) {
      lines = [];
      this.sessions.set("cto", lines);
    }
    lines.push(entry);
    if (lines.length > SESSION_LINES_CAP) lines.splice(0, lines.length - SESSION_LINES_CAP);
    this.emit({
      type: "agent.output",
      id: this.sessionId(),
      entry,
      stream: "out",
      at: now(),
    });
    this.scheduleSessionWrite();
  }

  private appendSessionLine(cli: string, line: string): void {
    this.appendEntry(parseOneShotLine(cli, line));
  }

  private appendMarker(text: string): void {
    this.appendEntry({ type: "sys", d: text });
  }

  private write(report: CTOReport): void {
    const file = this.path();
    try {
      mkdirSync(dirname(file), { recursive: true });
      const data: Record<string, unknown> = {
        at: report.at,
        agent: report.agent,
        cli: report.cli,
        model: report.model,
        state: report.state,
      };
      writeFileSync(file, serializeDocument(data, `\n${report.markdown}\n`, REPORT_KEYS));
    } catch (err) {
      console.error(`[repoos] could not write the CTO report: ${(err as Error).message}`);
    }
  }
}
