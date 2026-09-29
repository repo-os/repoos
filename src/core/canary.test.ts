import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { buildCanaryPrompt, canaryRelPath, nextCanaryDigit, parseCanaryDigit } from "./canary.js";
import { readCanaryCounter, scaffoldCanaryFile } from "./canary-repo.js";
import { health } from "../server/routes/info.js";
import type { RouteContext } from "../server/routes/types.js";

describe("canary counter", () => {
  it("defaults to 0 when the file is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "canary-"));
    expect(readCanaryCounter(root)).toBe(0);
  });

  it("wraps 9 to 0", () => {
    expect(nextCanaryDigit(9)).toBe(0);
    expect(nextCanaryDigit(3)).toBe(4);
  });

  it("parses a single digit and rejects garbage", () => {
    expect(parseCanaryDigit("7\n")).toBe(7);
    expect(parseCanaryDigit("12")).toBe(0);
    expect(parseCanaryDigit("x")).toBe(0);
  });

  it("reads the managed repo file", () => {
    const root = mkdtempSync(join(tmpdir(), "canary-"));
    const rel = canaryRelPath(".repoos");
    writeFileSync(join(root, rel), "5", "utf8");
    expect(readCanaryCounter(root)).toBe(5);
  });

  it("builds a repo-agnostic prompt", () => {
    const prompt = buildCanaryPrompt("repoos/.repoos/canary.txt");
    expect(prompt).toContain("repoos/.repoos/canary.txt");
    expect(prompt).not.toContain("src/core/canary");
  });

  it("scaffolds the counter file once", () => {
    const root = mkdtempSync(join(tmpdir(), "canary-"));
    expect(scaffoldCanaryFile(root, ".repoos")).toBeTruthy();
    expect(readFileSync(join(root, canaryRelPath(".repoos")), "utf8")).toBe("0");
    expect(scaffoldCanaryFile(root, ".repoos")).toBeNull();
  });
});

describe("GET /api/health canaryCounter", () => {
  it("reads from the managed repo root in ctx.config", async () => {
    const root = mkdtempSync(join(tmpdir(), "canary-health-"));
    writeFileSync(join(root, canaryRelPath()), "8", "utf8");

    const ctx = {
      config: { root, cacheDir: ".repoos", workDir: "work" },
      index: { snapshot: () => ({ taskCount: 0 }) },
      reload: null,
    } as unknown as RouteContext;

    const server: Server = createServer((req, res) => {
      void health(ctx, req, res, {});
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      const body = (await res.json()) as { canaryCounter: number };
      expect(body.canaryCounter).toBe(8);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
