import { parseDocument } from "./frontmatter.js";

const ESCALATED_ACTIVITY =
  /^- (\d{4}-\d{2}-\d{2}T[^\s]+) · watchdog: check wait escalated · (.+?) · next step: investigate the abnormal wait; the flag clears when the check starts$/;
const RECOVERED_ACTIVITY =
  /^- (\d{4}-\d{2}-\d{2}T[^\s]+) · watchdog: check wait ended or recovered — cleared needs_input$/;
const AUTOMATIC_FIELDS = new Set([
  "needs_input",
  "needs_input_reason",
  "needs_input_detail",
  "updated_at",
]);

function frontmatterIsWellFormed(content: string): boolean {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return false;
  const close = lines.indexOf("---", 1);
  if (close < 0) return false;
  const seen = new Set<string>();
  for (const line of lines.slice(1, close)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const key = line.match(/^([A-Za-z0-9_-]+):/);
    if (key) {
      if (seen.has(key[1]!)) return false;
      seen.add(key[1]!);
      continue;
    }
    if (/^\s+-\s+/.test(line)) continue;
    return false;
  }
  return true;
}

/** True only when a tracked task-file delta is a watchdog check-wait record. */
export function isWatchdogCheckWaitTaskDelta(
  before: string,
  after: string,
  taskPath: string,
): boolean {
  const oldDoc = parseDocument(before);
  const newDoc = parseDocument(after);
  if (!oldDoc.hadFrontmatter || !newDoc.hadFrontmatter) return false;
  if (!frontmatterIsWellFormed(before) || !frontmatterIsWellFormed(after)) return false;
  const id = taskPath.split("/").at(-1)?.split("-")[0];
  if (!id || String(oldDoc.data.id ?? "") !== id || String(newDoc.data.id ?? "") !== id)
    return false;

  const keys = new Set([...Object.keys(oldDoc.data), ...Object.keys(newDoc.data)]);
  let changed = false;
  const changedFields = new Set<string>();
  for (const key of keys) {
    if (JSON.stringify(oldDoc.data[key]) === JSON.stringify(newDoc.data[key])) continue;
    if (!AUTOMATIC_FIELDS.has(key)) return false;
    changedFields.add(key);
    changed = true;
  }
  if (!changed) return false;

  // Keep the entire task body byte-for-byte intact and accept only appended,
  // timestamped check-wait escalation/recovery activity entries.
  const oldBody = oldDoc.body.replace(/\n+$/, "");
  const newBody = newDoc.body.replace(/\n+$/, "");
  if (!newBody.startsWith(`${oldBody}\n`)) return false;
  const added = newBody
    .slice(oldBody.length + 1)
    .split("\n")
    .filter(Boolean);
  if (added.length === 0) return false;

  let needsInput = oldDoc.data.needs_input === true;
  let reason = oldDoc.data.needs_input_reason;
  let detail = oldDoc.data.needs_input_detail;
  let lastTimestamp: string | undefined;
  for (const line of added) {
    const escalated = ESCALATED_ACTIVITY.exec(line);
    if (escalated) {
      if (needsInput) return false;
      const timestamp = escalated[1]!;
      const activityDetail = escalated[2]!;
      if (!Number.isFinite(Date.parse(timestamp))) return false;
      needsInput = true;
      reason = "check-wait";
      detail = activityDetail;
      lastTimestamp = timestamp;
      continue;
    }
    const recovered = RECOVERED_ACTIVITY.exec(line);
    if (!recovered || !needsInput || reason !== "check-wait") return false;
    const timestamp = recovered[1]!;
    if (!Number.isFinite(Date.parse(timestamp))) return false;
    needsInput = false;
    reason = undefined;
    detail = undefined;
    lastTimestamp = timestamp;
  }

  if (!lastTimestamp || newDoc.data.updated_at !== lastTimestamp) return false;
  if (newDoc.data.needs_input !== needsInput) return false;
  if (needsInput) {
    if (newDoc.data.needs_input_reason !== reason || newDoc.data.needs_input_detail !== detail)
      return false;
  } else if (newDoc.data.needs_input_reason != null || newDoc.data.needs_input_detail != null) {
    return false;
  }
  // The state fields must actually reflect at least one machine transition.
  return changedFields.has("updated_at");
}
