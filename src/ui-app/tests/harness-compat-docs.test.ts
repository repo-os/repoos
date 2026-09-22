import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_COMPATIBILITY_MANIFEST } from "../../core/agent-compatibility";

/**
 * The user-docs table on the coding-harness compatibility page is the
 * human-readable face of `src/core/agent-compatibility.json`. It must never
 * quietly drift from the manifest: certifying a release, or widening a range,
 * requires a deliberate manifest update (docs/agent-compatibility.md), and
 * this test fails the close-out gate if the page stops reflecting it.
 */
// Vitest's import.meta.url is not a file: URL, so resolve from cwd (tests
// always run from the repo root).
const DOCS_PATH = join(process.cwd(), "user-docs/coding-harness-compatibility.md");

/** Strip a markdown image/link to its visible text, backticks, and bold markers. */
function cellText(raw: string): string {
  return raw
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .trim();
}

function parseTable(content: string): string[][] {
  const rows: string[][] = [];
  let inTable = false;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      inTable = false;
      continue;
    }
    // Separator row (| --- | --- |) between header and body.
    if (/^\|[\s:|-]+\|$/.test(trimmed) && trimmed.includes("---")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    const cells = trimmed.split("|").slice(1, -1).map(cellText);
    if (cells.length > 0 && cells.every((c) => c.length > 0)) rows.push(cells);
  }
  return rows;
}

// The harness table has 6 cols: Harness | CLI id | Binary | Supported range | Newest certified | Notes
// The seam table that follows it has 2 cols — filter to 6-col rows only.
const HARNESS_COL_COUNT = 6;

describe("user-docs supported-versions table vs. manifest", () => {
  const docs = readFileSync(DOCS_PATH, "utf8");
  const rows = parseTable(docs)
    .filter((r) => !r.every((c) => /^[-: ]+$/.test(c)))
    .filter((r) => r.length === HARNESS_COL_COUNT);

  it("derives from the manifest without effort", () => {
    expect(docs).toMatch(/derived from `src\/core\/agent-compatibility\.json`/);
  });

  it("has one row per manifest contract", () => {
    expect(rows.length).toBe(AGENT_COMPATIBILITY_MANIFEST.contracts.length);
  });

  it("keeps each row's range, certification, status, and official link in sync", () => {
    for (const contract of AGENT_COMPATIBILITY_MANIFEST.contracts) {
      // col[0] = Harness (display name), col[3] = Supported range, col[4] = Newest certified
      const row = rows.find((cells) => cells[0] === contract.name);
      expect(row, `no docs row for manifest contract "${contract.name}"`).toBeDefined();
      // Supported range must match the manifest verbatim.
      expect(row![3], `Supported range for ${contract.name}`).toContain(contract.supportedRange);
      // Newest certified column must reflect the manifest.
      const certifiedCell = contract.newestCertifiedVersion ?? "Pending";
      expect(
        row![4],
        `row for ${contract.name} must show newest certified ${certifiedCell}`,
      ).toContain(certifiedCell);
    }
  });
});
