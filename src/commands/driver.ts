/**
 * `repoos driver brief` (#0731) — print the CTO's board brief from live state.
 *
 * Server-backed: the brief is assembled server-side (it needs the runner, the
 * close-out coordinator, `.repoos/checks.db`, host status and git history) and
 * this command renders it for a human or emits `--json` for a driver agent.
 */
import { c } from "../cli/colors.js";
import { RepoOsApi, RepoOsApiError } from "../cli/repoos-api.js";

interface CommonOpts {
  json: boolean;
  port?: number;
}

function parseFlags(args: string[]): { rest: string[]; opts: CommonOpts; error?: string } {
  const opts: CommonOpts = { json: false };
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") opts.json = true;
    else if (a === "--port") {
      const p = args[++i];
      const n = Number(p);
      if (!p || !Number.isInteger(n) || n <= 0)
        return { rest, opts, error: "--port requires a positive integer" };
      opts.port = n;
    } else rest.push(a);
  }
  return { rest, opts };
}

function printErr(message: string): void {
  console.error(c.red("  ✗ ") + message);
}

async function ensureServer(api: RepoOsApi): Promise<void> {
  if (!(await api.health())) {
    throw new RepoOsApiError(
      `Can't reach the RepoOS server at ${api.base}. Start it with \`repoos serve\`.`,
      0,
    );
  }
}

interface BriefTaskEntry {
  id: string;
  title: string;
  priority: string;
  area: string;
  cause: string | null;
}

interface BriefView {
  generatedAt: string;
  sinceTag: string | null;
  automationPaused: boolean;
  approvalEnabled: boolean;
  mergedSinceTag: { shortSha: string; subject: string; taskId: string | null }[];
  tasksByStatus: { status: string; count: number; tasks: BriefTaskEntry[] }[];
  runningAgents: { taskId: string; startedAt: string; stalled: boolean }[];
  queuedCloseOuts: { taskId: string; title: string; phase: string; queuePosition: number }[];
  failedCloseOuts: { taskId: string; title: string; reason: string | null }[];
  recentCloseOutOutcomes: { taskId: string; outcome: string; at: string; reason: string }[];
  hosts: {
    host: string;
    healthy: boolean;
    probed: boolean;
    inFlight: number;
    queued: number;
    detail: string | null;
    hungRuns: { taskId: string; at: string }[];
  }[];
  runs: {
    recentRuns: number;
    hung: number;
    failed: number;
    slowRuns: { label: string; ratio: number; taskId: string | null; likelyCause: string | null }[];
  };
  configChanges: {
    baseline: string | null;
    changes: { shortSha: string; subject: string }[];
    changedKeys: string[];
  };
  rules: { heading: string; text: string }[];
  recommendations: { owner: string; title: string; detail: string; taskId: string | null }[];
}

function renderBrief(brief: BriefView): void {
  const line = (s = "") => console.log(s);
  line();
  line(c.bold("  RepoOS board brief") + c.dim(`  ·  ${brief.generatedAt}`));
  const flags = [
    brief.automationPaused ? c.yellow("automation paused") : null,
    brief.approvalEnabled ? "auto-approve on" : "auto-approve off",
  ]
    .filter(Boolean)
    .join("  ·  ");
  line(c.dim(`  ${flags}`));
  line();

  // Recommendations first — a new driver wants the next moves up top.
  line(c.bold("  Next actions"));
  if (!brief.recommendations.length) line(c.dim("    (none)"));
  for (const r of brief.recommendations) {
    const owner = r.owner === "cto" ? c.cyan("CTO ") : c.yellow("you ");
    line(`    ${owner} ${r.title}`);
    line(c.dim(`          ${r.detail}`));
  }
  line();

  // Board by status.
  line(c.bold("  Board"));
  if (!brief.tasksByStatus.length) line(c.dim("    (no tasks)"));
  for (const g of brief.tasksByStatus) {
    line(`    ${c.bold(g.status)} ${c.dim(`(${g.count})`)}`);
    for (const t of g.tasks.slice(0, 8)) {
      const cause = t.cause ? c.dim(` — ${t.cause}`) : "";
      line(`      #${t.id} [${t.priority}] ${t.title}${cause}`);
    }
    if (g.tasks.length > 8) line(c.dim(`      … ${g.tasks.length - 8} more`));
  }
  line();

  // Merged since the last tag.
  line(c.bold(`  Merged since ${brief.sinceTag ?? "the beginning"}`));
  if (!brief.mergedSinceTag.length) line(c.dim("    (nothing merged)"));
  for (const m of brief.mergedSinceTag.slice(0, 15)) {
    const tag = m.taskId ? c.dim(` (#${m.taskId})`) : "";
    line(`    ${c.dim(m.shortSha)} ${m.subject}${tag}`);
  }
  line();

  // Running agents and close-outs.
  line(c.bold("  Running"));
  if (!brief.runningAgents.length) line(c.dim("    (no agents running)"));
  for (const a of brief.runningAgents) {
    const stall = a.stalled ? c.yellow("  stalled") : "";
    line(`    #${a.taskId} engineer${stall}`);
  }
  if (brief.queuedCloseOuts.length) {
    line(c.bold("  Close-out queue"));
    for (const j of brief.queuedCloseOuts) {
      const pos = j.queuePosition >= 0 ? c.dim(` #${j.queuePosition + 1}`) : "";
      line(`    #${j.taskId} ${j.phase}${pos}`);
    }
  }
  if (brief.failedCloseOuts.length) {
    line(c.red("  Failed close-outs"));
    for (const j of brief.failedCloseOuts) {
      line(`    #${j.taskId} — ${j.reason ?? "close-out failed"}`);
    }
  }
  const recentFailures = brief.recentCloseOutOutcomes.filter((o) => o.outcome !== "succeeded");
  if (recentFailures.length) {
    line(c.dim("  Recent close-out outcomes"));
    for (const o of recentFailures.slice(0, 5)) {
      line(c.dim(`    #${o.taskId} ${o.outcome} — ${o.reason || "no reason recorded"}`));
    }
  }
  line();

  // Host health and recent runs.
  line(c.bold("  Hosts"));
  if (!brief.hosts.length) line(c.dim("    (no remote hosts configured)"));
  for (const h of brief.hosts) {
    const state = h.healthy
      ? c.green("healthy")
      : h.probed
        ? c.red("unhealthy")
        : c.dim("unprobed");
    const detail = h.detail ? c.dim(` — ${h.detail}`) : "";
    line(`    ${h.host} ${state} ${c.dim(`(${h.inFlight}/${h.queued} running/queued)`)}${detail}`);
  }
  line(
    c.dim(
      `    recent runs: ${brief.runs.recentRuns} · failed ${brief.runs.failed} · hung ${brief.runs.hung}`,
    ),
  );
  for (const s of brief.runs.slowRuns) {
    line(c.yellow(`    slow: ${s.label} at ${s.ratio.toFixed(1)}× median`));
    if (s.likelyCause) line(c.dim(`          ${s.likelyCause}`));
  }
  line();

  // Config changes since the baseline.
  line(c.bold(`  Config changes since ${brief.configChanges.baseline ?? "baseline"}`));
  if (!brief.configChanges.changes.length && !brief.configChanges.changedKeys.length) {
    line(c.dim("    (none)"));
  }
  for (const ch of brief.configChanges.changes) line(`    ${c.dim(ch.shortSha)} ${ch.subject}`);
  if (brief.configChanges.changedKeys.length) {
    line(c.dim(`    keys changed: ${brief.configChanges.changedKeys.join(", ")}`));
  }
  line();

  // The rules that matter to a driver.
  if (brief.rules.length) {
    line(c.bold("  Rules that matter (from AGENTS.md)"));
    for (const r of brief.rules) {
      line(c.dim(`    [${r.heading}]`));
      line(`      ${r.text}`);
    }
    line();
  }
}

export async function cmdDriver(args: string[]): Promise<number> {
  const sub = args[0];
  if (sub !== "brief") {
    printErr("Usage: repoos driver brief [--json] [--port N]");
    return 1;
  }
  const { opts, error } = parseFlags(args.slice(1));
  if (error) {
    printErr(error);
    return 1;
  }
  const api = new RepoOsApi({ port: opts.port });
  try {
    await ensureServer(api);
    const data = await api.requestOk("GET", "/api/driver/brief");
    if (opts.json) {
      console.log(JSON.stringify(data, null, 2));
      return 0;
    }
    renderBrief(data as unknown as BriefView);
    return 0;
  } catch (e) {
    printErr((e as RepoOsApiError).message);
    return 1;
  }
}
