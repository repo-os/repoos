import { describe, expect, it } from "vitest";
import { extractTaskProofCommands } from "../../core/task-proof-commands.js";

describe("extractTaskProofCommands (#0697)", () => {
  it("reads commands from a Proof section fence", () => {
    const body = `## Problem

x

## Proof

\`\`\`bash
bun run test
npm run lint
\`\`\`
`;
    expect(extractTaskProofCommands(body)).toEqual(["bun run test", "npm run lint"]);
  });

  it("omits long-running / server commands", () => {
    const body = `## Proof

\`\`\`bash
repoos serve
bun run dev
bun run test
\`\`\`
`;
    expect(extractTaskProofCommands(body)).toEqual(["bun run test"]);
  });

  it("reads a Proof command: line", () => {
    const body = "Proof command: `cargo test`";
    expect(extractTaskProofCommands(body)).toEqual(["cargo test"]);
  });
});
