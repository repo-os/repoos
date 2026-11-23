#!/usr/bin/env bun
/** Write the committed release record using the same builder and writer as the Releases page. */
import { createReleaseHistoryEntry, writeReleaseSurfaces } from "../src/server/release-history.js";

const version = process.argv[2]?.trim();
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("usage: bun scripts/write-release-record.ts <X.Y.Z>");
  process.exit(2);
}

const latestTag = Bun.spawnSync(["git", "describe", "--tags", "--abbrev=0"], {
  stdout: "pipe",
  stderr: "ignore",
});
const range = latestTag.exitCode === 0 ? `${latestTag.stdout.toString().trim()}..HEAD` : "HEAD";
const log = Bun.spawnSync(["git", "log", range, "-n", "300", "--format=%h %s"], {
  stdout: "pipe",
  stderr: "pipe",
});
if (log.exitCode !== 0) {
  console.error(log.stderr.toString().trim() || "Could not collect release notes from git.");
  process.exit(log.exitCode || 1);
}

const commits = log.stdout.toString().trim().split("\n").filter(Boolean);
const entry = createReleaseHistoryEntry(version, commits);
const result = writeReleaseSurfaces(process.cwd(), entry);
console.log(
  result.changed
    ? `Wrote ${entry.tag} to release history and changelog.`
    : `${entry.tag} record already up to date.`,
);
