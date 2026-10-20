/**
 * Canonical remote capture context (#0854). The runner must capture what the
 * control plane would: a `## Shots` edit made after the branch was cut (or a
 * board-only config change) must reach the runner even though the bundled branch
 * still holds the old copy. These tests pin the pure overlay the worker applies
 * and the JSON round-trip of the payload.
 */
import { describe, expect, it } from "vitest";
import type { PreviewConfig, RepoOSConfig, Task } from "../../core/types.js";
import {
  applyCanonicalCapture,
  canonicalCaptureContext,
  parseCanonicalCaptureContext,
  type CanonicalCapturePlan,
} from "../../core/remote-capture.js";
import { parseShotPlan } from "../../core/shot-plan.js";

const OLD_BODY = '## Shots\n```json\n[{ "target": "default", "route": "/old" }]\n```\n';
const NEW_BODY = '## Shots\n```json\n[{ "target": "default", "route": "/new" }]\n```\n';

function config(overrides: Partial<RepoOSConfig> = {}): RepoOSConfig {
  return {
    root: "/tmp/repoos-remote-capture",
    workDir: "work",
    cacheDir: ".repoos",
    ...overrides,
  } as RepoOSConfig;
}

function task(body: string, overrides: Partial<Task> = {}): Task {
  return {
    id: "0854",
    status: "active",
    branch: "feat/x",
    area: "core",
    body,
    ...overrides,
  } as Task;
}

describe("applyCanonicalCapture (#0854)", () => {
  it.each([
    ["the bundled body still holds the old plan", OLD_BODY],
    ["the bundled body is missing the ## Shots section", "# Task\n\nno shots here\n"],
    ["the bundled body is empty", ""],
  ])("uses the canonical body when %s", (_label, bundledBody) => {
    const canonical = canonicalCaptureContext(config(), task(NEW_BODY));
    const applied = applyCanonicalCapture({ config: config(), task: task(bundledBody) }, canonical);
    expect(parseShotPlan(applied.task.body).shots).toEqual([{ target: "default", route: "/new" }]);
    expect(applied.task.area).toBe("core");
  });

  it("overrides the bundled config with the canonical preview/shot slices", () => {
    const base = {
      config: config({ preview: { command: "old" } as PreviewConfig }),
      task: task(NEW_BODY),
    };
    const canonical = canonicalCaptureContext(
      config({ preview: { command: "new" } as PreviewConfig }),
      task(NEW_BODY),
    );
    expect(applyCanonicalCapture(base, canonical).config.preview?.command).toBe("new");
  });

  it("returns the bundled task/config untouched when no canonical context is sent", () => {
    const base = { config: config(), task: task(OLD_BODY) };
    expect(applyCanonicalCapture(base, undefined)).toBe(base);
  });
});

describe("canonicalCaptureContext / parseCanonicalCaptureContext (#0854)", () => {
  it("round-trips the task body, area, config and plan through JSON", () => {
    const plan: CanonicalCapturePlan = {
      entries: [{ target: "default", route: "/new", provenance: { kind: "declared" } }],
      errors: ["shot #2: bad"],
      skips: ["Docs site skipped: no docs shot declared"],
      collapsed: [],
    };
    const original = canonicalCaptureContext(
      config({ preview: { command: "x" } }),
      task(NEW_BODY),
      plan,
    );
    expect(parseCanonicalCaptureContext(JSON.stringify(original))).toEqual(original);
  });

  it("treats an absent payload as no canonical context", () => {
    expect(parseCanonicalCaptureContext(undefined)).toBeUndefined();
    expect(parseCanonicalCaptureContext("")).toBeUndefined();
  });

  it.each([
    ["malformed JSON", "{not json", /malformed/],
    ["a task without a body", JSON.stringify({ task: {} }), /task body/],
    [
      "a plan missing an array",
      JSON.stringify({ plan: { entries: [], errors: [] } }),
      /invalid plan/,
    ],
  ])("rejects %s", (_label, raw, pattern) => {
    expect(() => parseCanonicalCaptureContext(raw)).toThrow(pattern);
  });
});
