/**
 * GET/PUT /api/config/raw (#0375) — the raw repoos.toml escape hatch. Covers
 * the properties the acceptance criteria hang on: invalid TOML is refused
 * before it reaches disk, and a save based on a stale hash is refused with a
 * 409 so a concurrent curated-field save is never silently overwritten.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RepoOSConfig } from "../../core/types";
import type { RouteContext } from "../../server/routes/types";
import { readRawConfig, writeRawConfig } from "../../server/routes/config";

function makeReq(body: string): IncomingMessage {
  const req = {
    headers: { "content-type": "application/json" },
    url: "/api/config/raw",
    socket: { remoteAddress: "127.0.0.1" },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(body, "utf8");
    },
  };
  return req as unknown as IncomingMessage;
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

function makeCtx(root: string): { ctx: RouteContext; refreshAll: ReturnType<typeof vi.fn> } {
  const config = { root } as RepoOSConfig;
  const refreshAll = vi.fn();
  const ctx = {
    config,
    repoos: { config: {} },
    index: { refreshAll },
  } as unknown as RouteContext;
  return { ctx, refreshAll };
}

describe("config raw routes (#0375)", () => {
  let root: string;
  const tomlPath = () => join(root, "repoos.toml");

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-raw-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("reads the current file and its hash", async () => {
    writeFileSync(tomlPath(), "maxActiveTasks = 3\n", "utf8");
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    readRawConfig(ctx, makeReq(""), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload.content).toBe("maxActiveTasks = 3\n");
    expect(typeof fake.payload.hash).toBe("string");
  });

  it("reads an empty document when repoos.toml does not exist", () => {
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    readRawConfig(ctx, makeReq(""), res, {});
    expect(fake.status).toBe(200);
    expect(fake.payload).toEqual({ content: "", hash: expect.any(String) });
  });

  it("writes valid TOML and reloads config + index", async () => {
    writeFileSync(tomlPath(), "maxActiveTasks = 3\n", "utf8");
    const { ctx, refreshAll } = makeCtx(root);
    const { res: readRes, fake: readFake } = makeRes();
    readRawConfig(ctx, makeReq(""), readRes, {});

    const { res, fake } = makeRes();
    await writeRawConfig(
      ctx,
      makeReq(JSON.stringify({ content: "maxActiveTasks = 5\n", baseHash: readFake.payload.hash })),
      res,
      {},
    );

    expect(fake.status).toBe(200);
    expect(fake.payload.ok).toBe(true);
    expect(fake.payload.hash).not.toBe(readFake.payload.hash);
    expect(readFileSync(tomlPath(), "utf8")).toBe("maxActiveTasks = 5\n");
    expect(refreshAll).toHaveBeenCalled();
  });

  it("refuses invalid TOML without touching the file", async () => {
    writeFileSync(tomlPath(), "maxActiveTasks = 3\n", "utf8");
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    await writeRawConfig(
      ctx,
      makeReq(JSON.stringify({ content: "maxActiveTasks = [1, 2\n" })),
      res,
      {},
    );
    expect(fake.status).toBe(400);
    expect(fake.payload.error).toMatch(/Invalid TOML on line 2/);
    expect(readFileSync(tomlPath(), "utf8")).toBe("maxActiveTasks = 3\n");
  });

  it("refuses a save whose baseHash is stale, leaving the file alone", async () => {
    writeFileSync(tomlPath(), "maxActiveTasks = 5\n", "utf8");
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    await writeRawConfig(
      ctx,
      makeReq(
        JSON.stringify({
          content: "maxActiveTasks = 9\n",
          baseHash: "hash-from-a-now-stale-editor",
        }),
      ),
      res,
      {},
    );
    expect(fake.status).toBe(409);
    expect(fake.payload.error).toMatch(/changed on disk/);
    expect(fake.payload.hash).toEqual(expect.any(String));
    expect(readFileSync(tomlPath(), "utf8")).toBe("maxActiveTasks = 5\n");
  });

  it("allows a save with no baseHash (first-load fallback)", async () => {
    expect(existsSync(tomlPath())).toBe(false);
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    await writeRawConfig(ctx, makeReq(JSON.stringify({ content: "a = 1\n" })), res, {});
    expect(fake.status).toBe(200);
    expect(readFileSync(tomlPath(), "utf8")).toBe("a = 1\n");
  });

  it("rejects a non-string content body", async () => {
    const { ctx } = makeCtx(root);
    const { res, fake } = makeRes();
    await writeRawConfig(ctx, makeReq(JSON.stringify({ content: 5 })), res, {});
    expect(fake.status).toBe(400);
  });
});
