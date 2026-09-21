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

/** Strip a markdown image/link to its visible text, and backticks. */
function cellText(raw: string): string {
  return raw
    .trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
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

describe("user-docs supported-versions table vs. manifest", () => {
  const docs = readFileSync(DOCS_PATH, "utf8");
  const rows = parseTable(docs).filter((r) => !r.every((c) => /^[-: ]+$/.test(c)));

  it("derives from the manifest without effort", () => {
    expect(docs).toMatch(/derived from `src\/core\/agent-compatibility\.json`/);
  });

  it("has one row per manifest contract", () => {
    expect(rows.length).toBe(AGENT_COMPATIBILITY_MANIFEST.contracts.length);
  });

  it("keeps each row's range, certification, status, and official link in sync", () => {
    for (const contract of AGENT_COMPATIBILITY_MANIFEST.contracts) {
      const row = rows.find((cells) => cells[0] === contract.name);
      expect(row, `no docs row for manifest contract "${contract.name}"`).toBeDefined();
      // Supported range must match the manifest verbatim.
      expect(row![1], `Supported major/range for ${contract.name}`).toContain(
        contract.supportedRange,
      );
      const certifiedCell = contract.newestCertifiedVersion ?? "—";
      expect(
        row![2],
        `row for ${contract.name} must show newest certified ${certifiedCell}`,
      ).toContain(certifiedCell);
      // The status cell must not overclaim: with no baseline it says so; with one
      // it names the certified release.
      const status = row![3]!.toLowerCase();
      if (contract.newestCertifiedVersion) {
        expect(status, `Status column for ${contract.name}`).toContain(
          contract.newestCertifiedVersion.toLowerCase(),
        );
      } else {
        expect(status, `Status column for ${contract.name}`).toContain("not yet certified");
      }
      const expectedVerified = contract.verifiedAt ? contract.verifiedAt.slice(0, 10) : "Pending";
      expect(row![4], `Verified column for ${contract.name}`).toBe(expectedVerified);
      // A distinct, clickable official install/upgrade link column.
      expect(row![5], `Official install/upgrade link for ${contract.name}`).toContain(
        contract.officialUrl,
      );
    }
  });
});
