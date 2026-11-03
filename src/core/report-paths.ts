/**
 * One tracked home for a task's engineering and review reports (#1013).
 *
 * Both halves of the engineer → review loop describe the same task history, so
 * they live side by side under `<workDir>/reports/<task-id>/`:
 *
 *   round-<n>.json      engineering report for round n
 *   review-<n>.md       review report for pass n
 *
 * Engineering reports were first written under
 * `<workDir>/engineering-reports/<task-id>/`. That location is still read
 * (older clones/tasks keep working), but every new report is written to the
 * shared directory.
 */
import { join } from "node:path";

type ReportPathsConfig = { workDir?: string };

const normalizeDir = (dir: string): string =>
  dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");

export function reportsWorkDir(config: ReportPathsConfig): string {
  return normalizeDir(config.workDir || "work");
}

/** `<workDir>/reports`, repo-relative. */
export function reportsRootRelPath(config: ReportPathsConfig): string {
  return `${reportsWorkDir(config)}/reports`;
}

/** `<workDir>/reports/<taskId>`, repo-relative. */
export function reportsTaskDirRelPath(config: ReportPathsConfig, taskId: string): string {
  return `${reportsRootRelPath(config)}/${taskId}`;
}

/** Absolute `<root>/<workDir>/reports/<taskId>`. */
export function reportsTaskDir(
  config: ReportPathsConfig & { root: string },
  taskId: string,
): string {
  return join(config.root, reportsWorkDir(config), "reports", taskId);
}

/** `<workDir>/reports/<taskId>/round-<round>.json`, repo-relative. */
export function engineeringReportRelPath(
  config: ReportPathsConfig,
  taskId: string,
  round: number,
): string {
  return `${reportsTaskDirRelPath(config, taskId)}/round-${round}.json`;
}

/** `<workDir>/reports/<taskId>/review-<pass>.md`, repo-relative. */
export function reviewReportRelPath(
  config: ReportPathsConfig,
  taskId: string,
  pass: number,
): string {
  return `${reportsTaskDirRelPath(config, taskId)}/review-${pass}.md`;
}

/** Legacy engineering report directory (read-only compatibility). */
export function legacyEngineeringReportsDir(
  config: ReportPathsConfig & { root: string },
  taskId: string,
): string {
  return join(config.root, reportsWorkDir(config), "engineering-reports", taskId);
}

/** Legacy engineering report path, repo-relative (read-only compatibility). */
export function legacyEngineeringReportRelPath(
  config: ReportPathsConfig,
  taskId: string,
  round: number,
): string {
  return `${reportsWorkDir(config)}/engineering-reports/${taskId}/round-${round}.json`;
}

/**
 * True when `path` (repo-relative) is one of this task's own report files —
 * either the shared location or the legacy engineering-report directory.
 * Another task's report never matches, even when one id is a prefix of another.
 */
export function isOwnReportPath(path: string, config: ReportPathsConfig, taskId: string): boolean {
  const rel = normalizeDir(path);
  const shared = `${reportsTaskDirRelPath(config, taskId)}/`;
  if (rel.startsWith(shared)) return true;
  const legacy = `${reportsWorkDir(config)}/engineering-reports/${taskId}/`;
  return rel.startsWith(legacy);
}
