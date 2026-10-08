/**
 * Who to stamp on tasks, stories, and activity when the writer is not a human
 * with a session email (#0704).
 */
import { execFileSync } from "node:child_process";

/** API / UI create when auth is off or the session has no email. */
export const API_CREATOR = "api";

/** Managed PM chat or PM agent using `repoos new`. */
export const PM_CREATOR = "pm";

/** CLI create when git has no user.email. */
export const CLI_CREATOR = "cli";

export function resolveApiCreator(userEmail?: string | null): string {
  const email = userEmail?.trim();
  return email || API_CREATOR;
}

/**
 * Creator for `repoos new` and other CLI writes. PM board chats use session ids
 * like `pm-task-v2:<taskId>`; engineer turns use numeric task ids.
 */
export function resolveCliCreator(repoRoot?: string): string {
  if (process.env.REPOOS_AGENT === "1") {
    const sessionId = process.env.REPOOS_TASK_ID ?? "";
    if (/^pm-task-v2:/i.test(sessionId) || /^pm-task:/i.test(sessionId) || /^pm:/i.test(sessionId)) {
      return PM_CREATOR;
    }
  }
  try {
    const email = execFileSync("git", ["config", "user.email"], {
      encoding: "utf8",
      cwd: repoRoot ?? process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (email) return email;
  } catch {
    /* no git or no user.email */
  }
  return CLI_CREATOR;
}

export function creationActivityLabel(createdBy: string): string {
  return createdBy.trim() || "unknown";
}
