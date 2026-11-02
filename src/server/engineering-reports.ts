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

export function listEngineeringReports(config: RepoOSConfig, taskId: string): EngineeringReport[] {
  const dir = reportDir(config, taskId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /^round-\d+\.json$/.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(dir, name), "utf8")) as EngineeringReport];
      } catch {
        return [];
      }
    });
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
}): Promise<{ report: EngineeringReport | null; error?: string }> {
  const { config, taskId, workdir, branch, agent, model, baseSha, sourceSha } = args;
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
  const files = nameRows.map(([status, ...paths], index) => {
    const path = paths.length === 2 ? `${paths[0]} → ${paths[1]}` : paths[0];
    const row = numRows[index];
    return `- ${status} ${path}: +${row?.[0] ?? "0"} / −${row?.[1] ?? "0"}`;
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
  const sameSource = reports.find((report) => report.sourceSha === sourceSha);
  if (sameSource) {
    if (sameSource.markdown.startsWith(narrative + "\n\n## Generated change summary"))
      return { report: sameSource };
    return {
      report: null,
      error: `An immutable engineering report already exists for checked commit ${sourceSha}; change the source before creating another round.`,
    };
  }
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
