import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// AGENTS.md is truncated by several agents (Codex 32 KiB default, Muse Code
// 64 KiB; Claude Code warns near 40k chars). Keep it small: see
// docs/agents-md-size.md.
const LIMIT_BYTES = 30_000;

describe("AGENTS.md size budget", () => {
  it("stays under the budget agents can read in full", () => {
    const bytes = readFileSync(join(__dirname, "../../AGENTS.md")).byteLength;
    expect(
      bytes,
      `AGENTS.md is ${bytes} bytes; move detail to docs/ (see docs/agents-md-size.md)`,
    ).toBeLessThan(LIMIT_BYTES);
  });
});
