/**
 * Routes for the Model providers tab (0327), exercised directly against a
 * minimal fake RouteContext (no full server boot). Pins:
 *
 *   - the registry response carries `hasKey` booleans and NEVER key material,
 *   - key saves land in the gitignored `.env` under the fixed env-var names
 *     and are immediately visible (process.env is updated in place),
 *   - an empty save clears the key,
 *   - link-only providers refuse key saves and usage fetches,
 *   - usage reads pass the stored key upstream as a bearer token and surface
 *     upstream failures as 502s with clean messages.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import {
  getModelProviders,
  getModelProviderUsage,
  readProviderKey,
  setModelProviderKey,
} from "../../server/routes/model-providers.js";
import { loadConfig } from "../../core/config";
import type { RepoOSConfig } from "../../core/types.js";

const ENV_KEYS = ["REPOOS_OPENROUTER_API_KEY", "REPOOS_OPENCODE_GO_API_KEY"] as const;
const tmpRoots: string[] = [];

afterEach(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
  for (const k of ENV_KEYS) delete process.env[k];
  vi.unstubAllGlobals();
});

function tmpRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-mprov-"));
  tmpRoots.push(dir);
  return dir;
}

function makeRes(): { capture: { statusCode: number; body: any }; res: unknown } {
  const capture = {
    statusCode: 0,
    body: undefined as any,
  };
  const res = {
    writeHead: (status: number) => {
      capture.statusCode = status;
    },
    end: (data?: string) => {
      if (data) capture.body = JSON.parse(data);
    },
  };
  return { capture, res };
}

const makeReq = (): IncomingMessage =>
  ({
    [Symbol.asyncIterator]: async function* () {
      /* empty body */
    },
  }) as unknown as IncomingMessage;

const reqWithBody = (body: unknown): IncomingMessage =>
  ({
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from(JSON.stringify(body), "utf8");
    },
  }) as unknown as IncomingMessage;

function makeCtx(root: string): { config: RepoOSConfig } {
  return { config: loadConfig(root) };
}

describe("readProviderKey", () => {
  it("prefers process.env over the boot-time config snapshot", () => {
    const row = { envVar: "REPOOS_OPENROUTER_API_KEY", configKey: "openrouterApiKey" };
    const config = { modelProviders: { openrouterApiKey: "from-config" } } as RepoOSConfig;
    expect(readProviderKey(config, row as never)).toBe("from-config");
    process.env.REPOOS_OPENROUTER_API_KEY = "from-env";
    expect(readProviderKey(config, row as never)).toBe("from-env");
  });

  it("returns empty when nothing is set anywhere", () => {
    expect(
      readProviderKey(
        {} as RepoOSConfig,
        {
          envVar: "REPOOS_OPENROUTER_API_KEY",
          configKey: "openrouterApiKey",
        } as never,
      ),
    ).toBe("");
  });
});

describe("GET /api/model-providers", () => {
  it("lists all four rows with hasKey booleans and never any key material", async () => {
    const root = tmpRoot();
    process.env.REPOOS_OPENROUTER_API_KEY = "sk-or-v1-secret-value";
    const ctx = makeCtx(root);
    const { capture, res } = makeRes();
    await getModelProviders(ctx as never, makeReq(), res as never, {});
    expect(capture.statusCode).toBe(200);
    expect(capture.body.providers.map((p: { id: string }) => p.id)).toEqual([
      "openrouter",
      "opencode-go",
      "opencode-zen",
      "deepinfra",
    ]);
    const openrouter = capture.body.providers.find((p: { id: string }) => p.id === "openrouter");
    expect(openrouter.hasKey).toBe(true);
    expect(openrouter.kind).toBe("live");
    const deepinfra = capture.body.providers.find((p: { id: string }) => p.id === "deepinfra");
    expect(deepinfra.hasKey).toBe(false);
    expect(deepinfra.kind).toBe("link");
    expect(JSON.stringify(capture.body)).not.toContain("sk-or-v1-secret-value");
  });
});

describe("POST /api/model-providers/:id/key", () => {
  it("saves the key to .env under the fixed env var and updates process.env", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    const { capture, res } = makeRes();
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "  sk-or-v1-abc  " }) as IncomingMessage,
      res as never,
      { param1: "openrouter" },
    );
    expect(capture.statusCode).toBe(200);
    expect(capture.body).toEqual({ ok: true, hasKey: true });
    expect(process.env.REPOOS_OPENROUTER_API_KEY).toBe("sk-or-v1-abc");
    expect(readFileSync(join(root, ".env"), "utf8")).toContain(
      "REPOOS_OPENROUTER_API_KEY=sk-or-v1-abc\n",
    );
    // The response must never echo the key back.
    expect(JSON.stringify(capture.body)).not.toContain("sk-or-v1-abc");
  });

  it("replaces an existing key with exactly one line", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    const res1 = makeRes();
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "first" }) as IncomingMessage,
      res1.res as never,
      {
        param1: "openrouter",
      },
    );
    const res2 = makeRes();
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "second" }) as IncomingMessage,
      res2.res as never,
      {
        param1: "openrouter",
      },
    );
    const env = readFileSync(join(root, ".env"), "utf8");
    expect(env).toContain("REPOOS_OPENROUTER_API_KEY=second");
    expect(env).not.toContain("first");
    expect(env.match(/REPOOS_OPENROUTER_API_KEY=/g)).toHaveLength(1);
    expect(process.env.REPOOS_OPENROUTER_API_KEY).toBe("second");
  });

  it("an empty key clears the line entirely", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "temp" }) as IncomingMessage,
      makeRes().res as never,
      {
        param1: "opencode-go",
      },
    );
    expect(existsSync(join(root, ".env"))).toBe(true);
    const res = makeRes();
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "" }) as IncomingMessage,
      res.res as never,
      {
        param1: "opencode-go",
      },
    );
    expect(res.capture.statusCode).toBe(200);
    expect(res.capture.body.hasKey).toBe(false);
    expect(readFileSync(join(root, ".env"), "utf8")).not.toContain("REPOOS_OPENCODE_GO_API_KEY");
    expect(process.env.REPOOS_OPENCODE_GO_API_KEY).toBeUndefined();
  });

  it("refuses key saves for link-only rows, unknown ids, and malformed payloads", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    for (const [id, body, expected] of [
      ["deepinfra", { key: "x" }, 400],
      ["opencode-zen", { key: "x" }, 400],
      ["nope", { key: "x" }, 404],
      ["openrouter", { key: 42 }, 400],
      ["openrouter", {}, 400],
    ] as const) {
      const { capture, res } = makeRes();
      await setModelProviderKey(ctx as never, reqWithBody(body) as IncomingMessage, res as never, {
        param1: id,
      });
      expect(capture.statusCode, `${id} ${JSON.stringify(body)}`).toBe(expected);
    }
    expect(existsSync(join(root, ".env"))).toBe(false);
  });

  it("rejects an overlong value without touching .env", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    const { capture, res } = makeRes();
    await setModelProviderKey(
      ctx as never,
      reqWithBody({ key: "x".repeat(501) }) as IncomingMessage,
      res as never,
      {
        param1: "openrouter",
      },
    );
    expect(capture.statusCode).toBe(400);
    expect(existsSync(join(root, ".env"))).toBe(false);
  });
});

describe("GET /api/model-providers/:id/usage", () => {
  it("404s unknown ids and refuses link-only rows before touching any key", async () => {
    const root = tmpRoot();
    const ctx = makeCtx(root);
    const r404 = makeRes();
    await getModelProviderUsage(ctx as never, makeReq(), r404.res as never, { param1: "nope" });
    expect(r404.capture.statusCode).toBe(404);
    const rLink = makeRes();
    await getModelProviderUsage(ctx as never, makeReq(), rLink.res as never, {
      param1: "deepinfra",
    });
    expect(rLink.capture.statusCode).toBe(400);
    expect(rLink.capture.body.error).toContain("dashboard");
  });

  it("400s when no key is saved yet", async () => {
    const ctx = makeCtx(tmpRoot());
    const { capture, res } = makeRes();
    await getModelProviderUsage(ctx as never, makeReq(), res as never, { param1: "openrouter" });
    expect(capture.statusCode).toBe(400);
    expect(capture.body.error).toContain("No OpenRouter API key saved yet");
  });

  it("sends the stored key upstream as a bearer token and returns the parsed spend", async () => {
    const root = tmpRoot();
    process.env.REPOOS_OPENROUTER_API_KEY = "sk-or-v1-live";
    const fn = vi.fn(async (url: string) => {
      const path = String(url).replace("https://openrouter.ai/api/v1", "");
      const bodies: Record<string, unknown> = {
        "/credits": { data: { total_credits: 50, total_usage: 20 } },
        "/key": { data: { usage_daily: 2.5, usage_weekly: 8, usage_monthly: 12, limit: 20 } },
      };
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => bodies[path],
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", fn);
    const ctx = makeCtx(root);
    const { capture, res } = makeRes();
    await getModelProviderUsage(ctx as never, makeReq(), res as never, { param1: "openrouter" });
    expect(capture.statusCode).toBe(200);
    expect(capture.body.kind).toBe("openrouter");
    expect(capture.body.credits.remaining).toBe(30);
    expect(capture.body.key.usageMonthly).toBe(12);
    expect(capture.body.key.limit).toBe(20);
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    expect(calls).toHaveLength(2);
    for (const [, opts] of calls) {
      expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-live");
    }
  });

  it("surfaces an upstream rejection as a 502 with the upstream message", async () => {
    const root = tmpRoot();
    process.env.REPOOS_OPENCODE_GO_API_KEY = "zen-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 401,
            headers: { get: () => "application/json" },
            json: async () => ({
              type: "error",
              error: { type: "AuthError", message: "Missing API key." },
            }),
          }) as unknown as Response,
      ),
    );
    const ctx = makeCtx(root);
    const { capture, res } = makeRes();
    await getModelProviderUsage(ctx as never, makeReq(), res as never, { param1: "opencode-go" });
    expect(capture.statusCode).toBe(502);
    expect(capture.body.error).toBe("Missing API key.");
  });
});
