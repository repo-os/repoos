/**
 * One-time migration: rename created→created_at, updated→updated_at,
 * convert date-only timestamps to full ISO-8601 UTC, and add an
 * Activity section to every task file.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";

const FM_DELIM = "---";

function normalizeTimestamp(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00Z`;
  return s;
}

function migrateFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const normalized = content.replace(/\r\n/g, "\n");

  if (!normalized.startsWith(FM_DELIM)) {
    console.log(`  skip (no frontmatter): ${filePath}`);
    return false;
  }

  const end = normalized.indexOf(`\n${FM_DELIM}`, FM_DELIM.length);
  if (end === -1) {
    console.log(`  skip (unclosed frontmatter): ${filePath}`);
    return false;
  }

  const fmRaw = normalized.slice(FM_DELIM.length + 1, end);
  const afterDelim = normalized.indexOf("\n", end + 1);
  const bodyStart = afterDelim === -1 ? end + 4 : afterDelim + 1;
  let body = normalized.slice(bodyStart);

  const lines = fmRaw.split("\n");
  const outLines = [];
  let createdVal = null;
  let updatedVal = null;
  let createdIsDeprecated = false;
  let updatedIsDeprecated = false;
  let hasCreatedAt = false;
  let hasUpdatedAt = false;
  let hasActivity = false;

  for (const line of lines) {
    const cm = line.match(/^created_at:(.*)$/);
    if (cm) {
      hasCreatedAt = true;
      createdVal = cm[1].trim();
      outLines.push(line);
      continue;
    }
    const um = line.match(/^updated_at:(.*)$/);
    if (um) {
      hasUpdatedAt = true;
      updatedVal = um[1].trim();
      outLines.push(line);
      continue;
    }
    const cd = line.match(/^created:(.*)$/);
    if (cd) {
      createdIsDeprecated = true;
      createdVal = cd[1].trim();
      continue; // skip old key, will emit created_at
    }
    const ud = line.match(/^updated:(.*)$/);
    if (ud) {
      updatedIsDeprecated = true;
      updatedVal = ud[1].trim();
      continue; // skip old key, will emit updated_at
    }
    outLines.push(line);
  }

  // Insert new keys where the old ones used to be
  if (createdIsDeprecated && !hasCreatedAt) {
    // find the last key before position and insert created_at after it
    const insertAfter = outLines.findLastIndex((l) => /^\S/.test(l) && !l.startsWith("#"));
    const ts = normalizeTimestamp(createdVal);
    outLines.splice(insertAfter + 1, 0, `created_at: "${ts}"`);
  }
  if (updatedIsDeprecated && !hasUpdatedAt) {
    const insertAfter = outLines.findLastIndex((l) => /^\S/.test(l) && !l.startsWith("#"));
    const ts = normalizeTimestamp(updatedVal);
    outLines.splice(insertAfter + 1, 0, `updated_at: "${ts}"`);
  }

  // Check for existing Activity section
  if (/\n## Activity\n/.test(body)) {
    hasActivity = true;
  }

  // Add Activity section if missing, with a created entry
  if (!hasActivity) {
    const ts =
      normalizeTimestamp(createdVal) || normalizeTimestamp(updatedVal) || "1970-01-01T00:00:00Z";
    const activityLine = `- ${ts} · created · (migrated)`;
    const trimmed = body.replace(/\s+$/, "");
    body = `${trimmed}\n\n## Activity\n\n${activityLine}\n`;
  }

  const newFm = outLines.join("\n");
  const newContent = `${FM_DELIM}\n${newFm}\n${FM_DELIM}\n${body}`;

  writeFileSync(filePath, newContent);
  return true;
}

// Find all .md files under work/
const root = new URL("..", import.meta.url).pathname;
const workDir = join(root, "work");
const files = readdirSync(workDir)
  .filter((f) => extname(f) === ".md")
  .map((f) => join(workDir, f));

let count = 0;
for (const f of files) {
  const name = f.split("/").pop();
  process.stdout.write(`  ${name} ... `);
  if (migrateFile(f)) {
    console.log("migrated");
    count++;
  }
}
console.log(`\nDone. ${count} file(s) migrated.`);
