#!/usr/bin/env bun
/**
 * Print the release notes for one tag from the committed release history.
 *
 * Used by `.github/workflows/release.yml` to populate the GitHub release body:
 * the notes are written by the release pipeline in the same commit as the
 * version bump, so they are present in the tag and need no GitHub API call or
 * signed tag-object fetch. Emits nothing for an older tag with no history
 * entry; the workflow then falls back to the tag annotation.
 */
import { readFileSync } from "node:fs";

interface Entry {
  version: string;
  tag: string;
  date: string;
  notes: string;
}

const wanted = process.argv[2]?.trim();
if (!wanted) {
  console.error("usage: bun scripts/release-notes.ts <tag-or-version>");
  process.exit(2);
}

let history: { releases?: Entry[] } = {};
try {
  // Resolve from the script location so the command works from any cwd.
  history = JSON.parse(readFileSync(new URL("../release-history.json", import.meta.url), "utf8"));
} catch {
  // No committed history (pre-pipeline tag): fall back to the tag annotation.
  process.exit(0);
}

const entry = (history.releases ?? []).find(
  (release) => release.tag === wanted || release.version === wanted.replace(/^v/, ""),
);
if (entry?.notes.trim()) {
  process.stdout.write(`${entry.notes.trim()}\n`);
}
