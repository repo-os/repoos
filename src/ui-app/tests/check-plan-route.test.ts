/**
 * `GET /api/check-plan` (#0447): the read-only payload behind the Checks
 * surface. It resolves the plan and runs nothing — a missing tool is reported
 * as a missing prerequisite, never as a pass.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { loadConfig } from "../../core/config.js";
import type { RepoOSConfig } from "../../core/types.js";
import type { RouteContext } from "../../server/routes/types.js";
import { getCheckPlan } from "../../server/routes/check-plan.js";

const roots: string[] = [];
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots.length = 0;
  vi.restoreAllMocks();
});

function makeReq(url: string): IncomingMessage {
  return { headers: {}, url, socket: { remoteAddress: "127.0.0.1" } } as unknown as IncomingMessage;
}

interface FakeRes {
  status: number;
  payload: any;
}

function makeRes(): { res: ServerResponse; fake: FakeRes } {
  const fake: FakeRes = { status: 0, payload: undefined };
  const res = {
    setHeader() {},
    writeHead(code: number) {
      fake.status = code;
    },
    end(p: string) {
      fake.payload = JSON.parse(p);
    },
  };
  return { res: res as unknown as ServerResponse, fake };
}

function makeCtx(root: string): RouteContext {
  const config = { ...loadConfig(root), root } as RepoOSConfig;
  return { config } as unknown as RouteContext;
}

function tmpRepo(toml: string): string {
  const d = mkdtempSync(join(tmpdir(), "repoos-check-plan-route-"));
  roots.push(d);
  writeFileSync(join(d, "repoos.toml"), toml);
  return d;
}

const TOML = `[check]
version = 1

[[check.steps]]
name = "build"
command = "go build ./..."
requires = ["definitely-not-installed-xyz"]

[[check.steps]]
name = "release-smoke"
command = "make release"
profiles = ["release"]
`;

describe("GET /api/check-plan", () => {
  it("returns the resolved plan for the default profile", () => {
    const root = tmpRepo(TOML);
    const { res, fake } = makeRes();
    getCheckPlan(makeCtx(root), makeReq("/api/check-plan"), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.ok).toBe(true);
    const plan = fake.payload.checkPlan;
    expect(plan.source).toBe("declared");
    expect(plan.profile).toBe("default");
    expect(plan.steps.map((s: { name: string }) => s.name)).toEqual(["build", "release-smoke"]);
    expect(plan.steps[0].missing[0].tool).toBe("definitely-not-installed-xyz");
    expect(plan.steps[1].selected).toBe(false);
    expect(plan.steps[1].skip.reason).toBe("profile");
  });

  it("honours a named profile from the query string", () => {
    const root = tmpRepo(TOML);
    const { res, fake } = makeRes();
    getCheckPlan(makeCtx(root), makeReq("/api/check-plan?profile=release"), res, {});
    expect(fake.payload.checkPlan.profile).toBe("release");
    expect(fake.payload.checkPlan.steps.every((s: { selected: boolean }) => s.selected)).toBe(true);
  });

  it("still answers 200 for an empty repo with no plan", () => {
    const d = mkdtempSync(join(tmpdir(), "repoos-check-plan-empty-"));
    roots.push(d);
    const { res, fake } = makeRes();
    getCheckPlan(makeCtx(d), makeReq("/api/check-plan"), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.checkPlan.source).toBe("empty");
    expect(fake.payload.checkPlan.steps).toEqual([]);
  });
});
