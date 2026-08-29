import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const docPath = resolve(__dirname, "../../../docs/agent-model-recommendations.md");

let content = "";
try {
  content = readFileSync(docPath, "utf-8");
} catch {
  // handled per-test
}

const REQUIRED_CATEGORIES = [
  "UI / visual work",
  "Core / server architecture",
  "Focused bug fixes",
  "Tests and debugging",
  "Documentation / analysis",
  "Task specification / PM work",
  "Code review",
  "Merge / close-out recovery",
];

const SUPPORTED_CLIS = ["opencode", "claude code", "qwen code", "codex"];

describe("agent-model-recommendations.md", () => {
  it("exists and is not empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("has a version and last-verified date", () => {
    expect(content).toMatch(/\*?\*?Version:\*?\*?\s*\d+\.\d+\.\d+/);
    expect(content).toMatch(/\*?\*?Last verified:\*?\*?\s*\d{4}-\d{2}-\d{2}/);
  });

  it("has a purpose section", () => {
    expect(content).toMatch(/## Purpose/);
  });

  it("explains how to read the guide", () => {
    expect(content).toMatch(/## How to read this guide/);
    expect(content).toMatch(/Compatibility/);
    expect(content).toMatch(/performance/);
  });

  it("documents each supported CLI with capabilities", () => {
    for (const cli of SUPPORTED_CLIS) {
      expect(content).toMatch(new RegExp(`### ${cli.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      expect(content).toMatch(/Capability\s+\|\s+Status/);
    }
  });

  it("documents all required task categories", () => {
    const categorySectionMatch = content.match(/## Recommendations by task category/);
    expect(categorySectionMatch).toBeTruthy();

    for (const cat of REQUIRED_CATEGORIES) {
      expect(content).toMatch(new RegExp(`### ${cat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });

  it("includes a default recommendation section", () => {
    expect(content).toMatch(/## Default recommendation/);
  });

  it("includes a model volatility section", () => {
    expect(content).toMatch(/## Model volatility/);
  });

  it("includes a known failure modes section", () => {
    expect(content).toMatch(/## Known failure modes/);
  });

  it("includes a refresh procedure section", () => {
    expect(content).toMatch(/## Refresh procedure/);
  });

  it("links to related task #0093 in the refresh procedure", () => {
    expect(content).toMatch(/#0093/);
  });

  it("includes a related tasks section linking to #0080, #0083, #0090, #0093, #0107", () => {
    const relatedMatch = content.match(/## Related tasks/);
    expect(relatedMatch).toBeTruthy();
    expect(content).toMatch(/#0080/);
    expect(content).toMatch(/#0083/);
    expect(content).toMatch(/#0090/);
    expect(content).toMatch(/#0093/);
    expect(content).toMatch(/#0107/);
  });

  it("distinguishes compatibility from performance in the how-to-read section", () => {
    const beforeCategories = content.split("## Recommendations by task category")[0];
    expect(beforeCategories).toMatch(/Compatibility.*distinct.*performance/i);
  });

  it("uses evidence-based terminology: confidence, sample size, last verified", () => {
    // Each recommendation table should have these columns
    const tables = content.match(
      /^\| Role \| CLI \| Model \| Confidence \| Sample \| Last verified \|$/gm,
    );
    expect(tables).not.toBeNull();
    expect(tables!.length).toBeGreaterThanOrEqual(REQUIRED_CATEGORIES.length);
  });

  it("has no hardcoded secret or credential patterns", () => {
    // Basic secret-pattern check: no api keys, tokens, or passwords
    expect(content).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
    expect(content).not.toMatch(/Bearer\s+[a-zA-Z0-9_-]{20,}/);
    expect(content).not.toMatch(/password\s*[:=]\s*\S+/i);
  });

  it("is discoverable via search by checking for the word 'recommendations'", () => {
    expect(content.toLowerCase()).toMatch(/recommendations/);
  });
});
