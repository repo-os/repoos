import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RepoOSConfig } from "../core/types.js";
import { runGit } from "../core/git.js";

export interface EngineeringReport {
  taskId: string;
  round: number;
  at: string;
  agent: string;
  model: string;
  branch: string;
  baseSha: string;
  sourceSha: string;
  wordCount: number;
  markdown: string;
}

const MAX_WORDS = 1000;
const words = (text: string): number =>
  (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length;
const reportDir = (config: RepoOSConfig, taskId: string) =>
  join(config.root, config.workDir || "work", "engineering-reports", taskId);

export interface EngineeringReportLoad {
  reports: EngineeringReport[];
  /** Unreadable or malformed report files, named so callers can surface them. */
  errors: string[];
}

function isEngineeringReport(
  value: unknown,
  taskId: string,
  round: number,
): value is EngineeringReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.taskId === "string" &&
    report.taskId === taskId &&
    typeof report.round === "number" &&
    Number.isInteger(report.round) &&
    report.round === round &&
    typeof report.at === "string" &&
    typeof report.agent === "string" &&
    typeof report.model === "string" &&
    typeof report.branch === "string" &&
    typeof report.baseSha === "string" &&
    typeof report.sourceSha === "string" &&
    typeof report.wordCount === "number" &&
    typeof report.markdown === "string"
  );
}

/**
 * Read every stored report for a task, keeping malformed files visible instead
 * of silently dropping them. A corrupt round must never look like an absent
 * one: callers surface `errors` and fail closed where history matters. A
 * report whose `taskId` or `round` does not match its location is rejected too
 * — a misplaced file must not appear in another task's history.
 */
export function loadEngineeringReports(
  config: RepoOSConfig,
  taskId: string,
): EngineeringReportLoad {
  const dir = reportDir(config, taskId);
  if (!existsSync(dir)) return { reports: [], errors: [] };
  const errors: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    return {
      reports: [],
      errors: [`could not read report directory ${dir}: ${(error as Error).message}`],
    };
  }
  const reports = names
    .filter((name) => /^round-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .flatMap((name) => {
      const expectedRound = Number(name.match(/^round-(\d+)\.json$/)?.[1]);
      try {
        const parsed: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (!isEngineeringReport(parsed, taskId, expectedRound)) {
          errors.push(
            `${name}: report identity does not match its task directory or round (expected taskId ${taskId}, round ${expectedRound})`,
          );
          return [];
        }
        return [parsed];
      } catch (error) {
        errors.push(`${name}: ${(error as Error).message}`);
        return [];
      }
    });
  return { reports, errors };
}

export function listEngineeringReports(config: RepoOSConfig, taskId: string): EngineeringReport[] {
  return loadEngineeringReports(config, taskId).reports;
}

/**
 * Pick the diff base for a report round.
 *
 * Round 1 diffs from the branch merge-base. A later round diffs from the
 * previous round's source tree, so its generated summary describes only this
 * round instead of replaying every earlier round on the branch. A retry of an
 * unfinished handoff keeps the base its report already recorded.
 */
export async function resolveEngineeringReportBase(args: {
  workdir: string;
  baseBranch: string;
  sourceSha: string;
  reports: EngineeringReport[];
  retryRound?: number;
}): Promise<{ baseSha: string } | { error: string }> {
  const retried =
    args.retryRound === undefined
      ? undefined
      : args.reports.find((report) => report.round === args.retryRound);
  if (retried) return { baseSha: retried.baseSha };
  const prior = args.reports.at(-1);
  if (prior) {
    const ancestor = await runGit(
      args.workdir,
      ["merge-base", "--is-ancestor", prior.sourceSha, args.sourceSha],
      10_000,
    );
    if (ancestor.status !== 0)
      return {
        error:
          `the previous engineering report's source commit (${prior.sourceSha}) is not an ancestor of this round's ` +
          "source, so a round-relative diff base cannot be determined (was the branch rebased or reset?). " +
          "Restore the branch history that contains the reviewed round before requesting handoff.",
      };
    return { baseSha: prior.sourceSha };
  }
  const base = await runGit(args.workdir, ["merge-base", args.baseBranch, args.sourceSha], 10_000);
  return base.status === 0
    ? { baseSha: base.stdout.trim() }
    : { error: "could not resolve the engineering report base tree" };
}

export function readEngineeringReport(
  config: RepoOSConfig,
  taskId: string,
  round: number,
): EngineeringReport | null {
  return listEngineeringReports(config, taskId).find((report) => report.round === round) ?? null;
}

/** Finalize the engineer-authored draft and server-computed Git summary after the check gate. */
export async function finalizeEngineeringReport(args: {
  config: RepoOSConfig;
  taskId: string;
  workdir: string;
  branch: string;
  agent: string;
  model: string;
  baseSha: string;
  sourceSha: string;
  /**
   * Round this call is retrying, when the previous handoff never completed.
   * A fresh engineering round (for example after review feedback) passes
   * nothing even when its source tree is unchanged, so it gets its own
   * immutable report instead of reusing or failing on the earlier one.
   */
  retryRound?: number;
  /** The task's own markdown file, excluded from the generated code summary. */
  taskPath?: string;
}): Promise<{ report: EngineeringReport | null; error?: string }> {
  const { config, taskId, workdir, branch, agent, model, baseSha, sourceSha, retryRound } = args;
  const dir = reportDir(config, taskId);
  const draftPath = join(workdir, config.cacheDir, "engineering-report-drafts", `${taskId}.md`);
  if (!existsSync(draftPath))
    return {
      report: null,
      error: `Engineering report draft is missing: ${config.cacheDir}/engineering-report-drafts/${taskId}.md`,
    };
  const narrative = readFileSync(draftPath, "utf8").trim();
  const narrativeWords = words(narrative);
  if (!narrative || narrativeWords > MAX_WORDS)
    return {
      report: null,
      error: `Engineering report must contain 1–1,000 words (draft has ${narrativeWords}); shorten it and request handoff again.`,
    };
  const requiredSections = [
    "## TL;DR",
    "## Work and rationale",
    "## Approaches tried",
    "## Challenges and blockers",
    "## Key learnings",
  ];
  const sectionPositions = requiredSections.map((section) =>
    narrative.search(new RegExp(`^${section}$`, "mi")),
  );
  const missingSections = requiredSections.filter((_, index) => sectionPositions[index] < 0);
  if (missingSections.length)
    return {
      report: null,
      error: `Engineering report is missing required sections: ${missingSections.join(", ")}.`,
    };
  if (sectionPositions[0] !== 0)
    return {
      report: null,
      error: "Engineering report must begin with ## TL;DR; remove any text before it.",
    };
  if (
    sectionPositions.some(
      (position, index) => index > 0 && position <= sectionPositions[index - 1]!,
    )
  )
    return {
      report: null,
      error: "Engineering report sections must appear in the required order, starting with TL;DR.",
    };
  const base = await runGit(workdir, ["rev-parse", `${baseSha}^{tree}`], 10_000);
  const head = await runGit(workdir, ["rev-parse", `${sourceSha}^{tree}`], 10_000);
  if (base.status !== 0 || head.status !== 0)
    return {
      report: null,
      error: "Could not identify the checked Git trees for the engineering report.",
    };
  const diff = await runGit(
    workdir,
    ["diff", "--no-ext-diff", "--find-renames", "--numstat", `${baseSha}..${sourceSha}`],
    10_000,
  );
  const names = await runGit(
    workdir,
    ["diff", "--no-ext-diff", "--find-renames", "--name-status", `${baseSha}..${sourceSha}`],
    10_000,
  );
  if (diff.status !== 0 || names.status !== 0)
    return {
      report: null,
      error: "Could not compute the deterministic engineering report diff summary.",
    };
  const nameRows = names.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const numRows = diff.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  // Round bookkeeping sits between the previous round's source tree and this
  // one's, so a later-round diff sees it even though it is not this round's
  // work. Keep it out of the generated change summary.
  const workDir = (config.workDir || "work").replace(/\\/g, "/").replace(/\/+$/, "");
  const reportPrefix = `${workDir}/engineering-reports/${taskId}/`;
  const taskPath = args.taskPath?.replace(/\\/g, "/");
  const isBookkeeping = (path: string): boolean =>
    path.startsWith(reportPrefix) || (taskPath !== undefined && path === taskPath);
  const files = nameRows.flatMap(([status, ...paths], index) => {
    if (paths.some(isBookkeeping)) return [];
    const path = paths.length === 2 ? `${paths[0]} → ${paths[1]}` : paths[0];
    const row = numRows[index];
    return [`- ${status} ${path}: +${row?.[0] ?? "0"} / −${row?.[1] ?? "0"}`];
  });
  const summary = [
    "## Generated change summary",
    "",
    `Base tree: \`${base.stdout.trim()}\``,
    `Source tree: \`${head.stdout.trim()}\``,
    "",
    ...(files.length ? files : ["- No changed files."]),
  ].join("\n");
  const markdown = `${narrative}\n\n${summary}`;
  const reportWords = words(markdown);
  if (reportWords > MAX_WORDS)
    return {
      report: null,
      error: `Engineering report including its generated change summary must contain at most 1,000 words (final report has ${reportWords}); shorten the draft and request handoff again.`,
    };
  const reports = listEngineeringReports(config, taskId);
  // Only an incomplete handoff may reuse its report. Everything else — a new
  // round after review feedback included — appends an immutable round, even
  // when the source tree did not move.
  const retried =
    retryRound === undefined ? null : reports.find((report) => report.round === retryRound);
  if (
    retried &&
    retried.sourceSha === sourceSha &&
    retried.markdown === `${narrative}\n\n${summary}`
  )
    return { report: retried };
  const round = reports.reduce((max, report) => Math.max(max, report.round), 0) + 1;
  const report: EngineeringReport = {
    taskId,
    round,
    at: new Date().toISOString(),
    agent,
    model,
    branch,
    baseSha: base.stdout.trim(),
    sourceSha,
    wordCount: reportWords,
    markdown,
  };
  mkdirSync(dir, { recursive: true });
  const finalPath = join(dir, `round-${round}.json`);
  if (existsSync(finalPath))
    return {
      report: null,
      error: `Engineering report round ${round} already exists; refusing to overwrite an immutable report.`,
    };
  writeFileSync(finalPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return { report };
}
