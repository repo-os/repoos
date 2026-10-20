import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureBrowserEvidence } from "../../../scripts/remote-runner/capture-browser.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("remote browser capture result artifact", () => {
  it("writes the actual setup error to result.json when capture cannot start", async () => {
    const output = mkdtempSync(join(tmpdir(), "repoos-browser-result-"));
    roots.push(output);
    const result = await captureBrowserEvidence(
      join(output, "missing-repo"),
      "0854",
      "shots",
      output,
    );
    const artifact = JSON.parse(readFileSync(join(output, "result.json"), "utf8")) as {
      ok: boolean;
      detail: string;
      results: { error: string };
    };
    expect(result.ok).toBe(false);
    expect(artifact.ok).toBe(false);
    expect(artifact.detail).toContain("Task #0854 was not found");
    expect(artifact.results.error).toBe(artifact.detail);
  });
});
