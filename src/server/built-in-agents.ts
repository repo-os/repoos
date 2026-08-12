/**
 * Built-in agents: pre-configured agents like Tech Debt Agent that extend RepoOS.
 * These agents are triggered on-demand or on a schedule.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { RepoOSConfig, Task } from "../core/types.js";
import { parseTask } from "../core/task.js";
import { patchTaskFile } from "./write.js";

interface TechDebtIssue {
  type: "outdated-dependency" | "code-duplication" | "high-complexity" | "unused-code" | "deprecated-api";
  file: string;
  line?: number;
  description: string;
  severity: "high" | "medium" | "low";
}

/**
 * Scan the repository for tech debt patterns.
 * Returns an array of identified issues.
 */
export function scanForTechDebt(config: RepoOSConfig): TechDebtIssue[] {
  const issues: TechDebtIssue[] = [];

  // 1. Check package.json for outdated dependencies
  const packageJsonPath = join(config.root, "package.json");
  try {
    const content = readFileSync(packageJsonPath, "utf8");
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const now = new Date();

    for (const [name, version] of Object.entries(deps)) {
      const versionStr = String(version);
      // Flag pre-release or wildcard versions
      if (versionStr.includes("alpha") || versionStr.includes("beta") || versionStr.includes("*")) {
        issues.push({
          type: "outdated-dependency",
          file: "package.json",
          description: `Dependency "${name}" uses pre-release or wildcard version: ${versionStr}`,
          severity: "medium",
        });
      }
    }
  } catch {
    // File doesn't exist or isn't valid JSON
  }

  // 2. Scan for high-complexity files (simple heuristic: very long files)
  try {
    const srcDir = join(config.root, "src");
    const files = readdirSync(srcDir, { recursive: true });

    for (const file of files) {
      if (typeof file !== "string") continue;
      const filepath = join(srcDir, file);
      try {
        const stat = statSync(filepath);
        if (!stat.isFile()) continue;

        const ext = extname(filepath);
        if (![".ts", ".tsx", ".js", ".jsx", ".vue"].includes(ext)) continue;

        const content = readFileSync(filepath, "utf8");
        const lines = content.split("\n").length;

        // Flag files with >500 lines as potentially complex
        if (lines > 500) {
          issues.push({
            type: "high-complexity",
            file: filepath.replace(config.root, ""),
            line: 1,
            description: `File has ${lines} lines of code — consider breaking it into smaller modules`,
            severity: "medium",
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // src directory doesn't exist
  }

  // 3. Check for common deprecated patterns
  const srcDir = join(config.root, "src");
  try {
    const files = readdirSync(srcDir, { recursive: true });

    for (const file of files) {
      if (typeof file !== "string") continue;
      const filepath = join(srcDir, file);
      try {
        const stat = statSync(filepath);
        if (!stat.isFile()) continue;

        const ext = extname(filepath);
        if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) continue;

        const content = readFileSync(filepath, "utf8");

        // Check for deprecated patterns
        if (content.includes("var ") && !content.includes("// var")) {
          issues.push({
            type: "deprecated-api",
            file: filepath.replace(config.root, ""),
            description: "File uses 'var' declarations — modernize to 'const' or 'let'",
            severity: "low",
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    // src directory doesn't exist
  }

  return issues;
}

/**
 * Create tasks in the inbox for tech debt issues.
 * Returns the number of tasks created.
 */
export async function createTechDebtTasks(
  config: RepoOSConfig,
  issues: TechDebtIssue[],
): Promise<number> {
  const workDir = join(config.root, config.workDir);
  let taskCount = 0;

  // Group issues by type for cleaner task creation
  const grouped = new Map<TechDebtIssue["type"], TechDebtIssue[]>();
  for (const issue of issues) {
    if (!grouped.has(issue.type)) grouped.set(issue.type, []);
    grouped.get(issue.type)!.push(issue);
  }

  // Create one task per issue type with multiple items
  for (const [type, typeIssues] of grouped) {
    const title = getTitleForIssueType(type);
    const body = formatIssuesForTask(typeIssues);

    // Find an available ID for the new task
    const taskId = findNextTaskId(workDir);
    const taskPath = join(workDir, `${taskId}-${slugify(title)}.md`);

    const frontmatter = `---
id: "${taskId}"
title: ${title}
type: chore
status: inbox
priority: p2
area: tech-debt
assigned_to: unassigned
created_by: tech-debt-agent
created_at: "${new Date().toISOString()}"
updated_at: "${new Date().toISOString()}"
---`;

    const taskContent = `${frontmatter}\n${body}`;

    try {
      const fs = await import("node:fs/promises");
      await fs.writeFile(taskPath, taskContent, "utf8");
      taskCount++;
    } catch {
      // Continue with next task if this one fails
    }
  }

  return taskCount;
}

function getTitleForIssueType(type: TechDebtIssue["type"]): string {
  switch (type) {
    case "outdated-dependency":
      return "Update outdated dependencies";
    case "code-duplication":
      return "Refactor duplicated code";
    case "high-complexity":
      return "Reduce file complexity";
    case "unused-code":
      return "Remove unused code";
    case "deprecated-api":
      return "Modernize deprecated patterns";
    default:
      return "Address tech debt";
  }
}

function formatIssuesForTask(issues: TechDebtIssue[]): string {
  let body = "## Issues Identified\n\n";

  for (const issue of issues) {
    body += `### ${issue.description}\n`;
    body += `- **File**: \`${issue.file}\`\n`;
    if (issue.line) body += `- **Line**: ${issue.line}\n`;
    body += `- **Severity**: ${issue.severity}\n\n`;
  }

  body += "## Next Steps\n\n";
  body += "1. Review each issue in the files listed above\n";
  body += "2. Make the suggested improvements\n";
  body += "3. Test the changes thoroughly\n";
  body += "4. Move this task to done when complete\n";

  return body;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function findNextTaskId(workDir: string): string {
  try {
    const files = readdirSync(workDir);
    const ids = files
      .map((f) => {
        const match = f.match(/^(\d+)-/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => n > 0);
    const maxId = Math.max(...ids, 0);
    return String(maxId + 1).padStart(4, "0");
  } catch {
    return "0001";
  }
}
