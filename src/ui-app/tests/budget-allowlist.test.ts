/**
 * #0764 — agent-driver budget controls: the `[[budget.allowlist]]` config
 * contract and the server-side enforcement (refusal, human bypass, no-op).
 */
import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  allowlistIsEmpty,
  agentModelAllowRows,
  describeAllowlistPairs,
  isPairOnAllowlist,
  normalizeAllowlistRows,
} from "../../core/budget-allowlist.js";
import { patchConfig, safeConfigForBrowser } from "../../server/routes/config.js";
import { overrideRefusal } from "../../server/agent-model-allowlist.js";
import { requestUsedLocalCliToken, writeLocalCliToken } from "../../server/local-token.js";
import type { RepoOSConfig, Task } from "../../core/types.js";

async function patch(
  root: string,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: Record<string, unknown> }> {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  const res: {
    statusCode?: number;
    payload?: string;
    writeHead(code: number): unknown;
    end(payload: string): void;
  } = {
    writeHead(code: number) {
      res.statusCode = code;
      return res;
    },
    end(payload: string) {
      res.payload = payload;
    },
  };
  const cfg = loadConfig(root);
  const ctx = {
    config: { root, cacheDir: cfg.cacheDir, workDir: cfg.workDir },
    repoos: { config: cfg },
    index: { refreshAll() {} },
    logger: { system() {} },
  } as never;
  await patchConfig(ctx, req as never, res as never, {});
  return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
}

function repo(toml = 'workDir = "work"\n'): string {
  const root = mkdtempSync(join(tmpdir(), "repoos-budget-"));
  writeFileSync(join(root, "repoos.toml"), toml);
  return root;
}

const ALLOW_TOML = `[[budget.allowlist]]
cli = "opencode"
models = ["big pickle", "deepseek v4"]

[[budget.allowlist]]
cli = "claude code"
models = ["sonnet"]
`;

describe("budget allowlist config contract (#0764)", () => {
  it("exposes the schema key and parser-only keys", () => {
    expect(getConfigSchema().some((f) => f.key === "budget.allowlist")).toBe(true);
    expect(SUPPORTED_TOML_KEYS).toContain("budget.allowlist.cli");
    expect(SUPPORTED_TOML_KEYS).toContain("budget.allowlist.models");
  });

  it("parses [[budget.allowlist]] rows into config.budget", () => {
    const root = repo(ALLOW_TOML);
    try {
      expect(loadConfig(root).budget?.allowlist).toEqual([
        { cli: "opencode", models: ["big pickle", "deepseek v4"] },
        { cli: "claude code", models: ["sonnet"] },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("writes a valid allowlist as rows the loader reads back", async () => {
    const root = repo();
    try {
      const res = await patch(root, {
        "budget.allowlist": [
          { cli: "opencode", models: ["big pickle"] },
          { cli: "claude code", models: ["sonnet", "opus"] },
        ],
      });
      expect(res.status).toBe(200);
      expect(loadConfig(root).budget?.allowlist).toEqual([
        { cli: "opencode", models: ["big pickle"] },
        { cli: "claude code", models: ["sonnet", "opus"] },
      ]);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain("[[budget.allowlist]]");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a malformed row with a clear message", async () => {
    const root = repo();
    try {
      const res = await patch(root, { "budget.allowlist": [{ cli: "opencode", models: [] }] });
      expect(res.status).toBe(400);
      expect(String(res.payload.error)).toContain("at least one model");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clears the last row without a duplicate key", async () => {
    const root = repo(ALLOW_TOML);
    try {
      const res = await patch(root, { "budget.allowlist": [] });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("[[budget.allowlist]]");
      expect(loadConfig(root).budget?.allowlist).toBeUndefined();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is a no-op when the list already matches disk", async () => {
    const root = repo(ALLOW_TOML);
    try {
      const before = readFileSync(join(root, "repoos.toml"), "utf8");
      const res = await patch(root, {
        "budget.allowlist": [
          { cli: "opencode", models: ["big pickle", "deepseek v4"] },
          { cli: "claude code", models: ["sonnet"] },
        ],
      });
      expect(res.status).toBe(200);
      expect(readFileSync(join(root, "repoos.toml"), "utf8")).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("exposes the allowlist to the browser under its schema key", () => {
    const safe = safeConfigForBrowser({
      budget: { allowlist: [{ cli: "opencode", models: ["big pickle"] }] },
    } as never);
    expect(safe["budget.allowlist"]).toEqual([{ cli: "opencode", models: ["big pickle"] }]);
    expect(safe.budget).toBeUndefined();
  });
});

describe("allowlist pure helpers (#0764)", () => {
  it("merges duplicate cli rows and dedupes models", () => {
    const result = normalizeAllowlistRows([
      { cli: "opencode", models: ["a", "b"] },
      { cli: "opencode", models: ["b", "c"] },
    ]);
    expect(result).toEqual({ rows: [{ cli: "opencode", models: ["a", "b", "c"] }] });
  });

  it("treats an empty/unset allowlist as unrestricted", () => {
    expect(allowlistIsEmpty(agentModelAllowRows(undefined))).toBe(true);
    expect(isPairOnAllowlist([], "opencode", "anything")).toBe(true);
    expect(describeAllowlistPairs([])).toBe("(none — unrestricted)");
  });

  it("only allows a listed cli with a listed model", () => {
    const rows = [{ cli: "opencode", models: ["big pickle"] }];
    expect(isPairOnAllowlist(rows, "opencode", "big pickle")).toBe(true);
    expect(isPairOnAllowlist(rows, "opencode", "expensive")).toBe(false);
    expect(isPairOnAllowlist(rows, "claude code", "sonnet")).toBe(false);
  });
});

function task(overrides: Partial<Task> = {}): Task {
  return { agentOverride: null, cliOverride: null, modelOverride: null, ...overrides } as Task;
}

function configWith(allowlist: { cli: string; models: string[] }[] | undefined): RepoOSConfig {
  return {
    agents: [
      { name: "engineer", cli: "opencode", model: "big pickle", enabled: true, instructions: "" },
    ],
    ...(allowlist ? { budget: { allowlist } } : {}),
  } as unknown as RepoOSConfig;
}

describe("agent-driver override enforcement (#0764)", () => {
  it("is a no-op when the allowlist is empty or unset", () => {
    expect(
      overrideRefusal(configWith(undefined), task(), { cliOverride: "claude code" }),
    ).toBeNull();
    expect(overrideRefusal(configWith([]), task(), { modelOverride: "expensive" })).toBeNull();
  });

  it("refuses a pair not on the allowlist and lists the allowed pairs", () => {
    const msg = overrideRefusal(configWith([{ cli: "opencode", models: ["big pickle"] }]), task(), {
      cliOverride: "claude code",
      modelOverride: "sonnet",
    });
    expect(msg).toBeTruthy();
    expect(msg).toContain("claude code + sonnet");
    expect(msg).toContain("opencode + big pickle");
  });

  it("allows a listed pair", () => {
    expect(
      overrideRefusal(configWith([{ cli: "opencode", models: ["big pickle"] }]), task(), {
        cliOverride: "opencode",
        modelOverride: "big pickle",
      }),
    ).toBeNull();
  });

  it("allows a CLI-only switch to a listed cli (model resets to its default)", () => {
    expect(
      overrideRefusal(configWith([{ cli: "claude code", models: ["sonnet"] }]), task(), {
        cliOverride: "claude code",
      }),
    ).toBeNull();
  });

  it("does not fire when no override is being set", () => {
    expect(
      overrideRefusal(configWith([{ cli: "opencode", models: ["big pickle"] }]), task(), {
        modelOverride: "default",
      }),
    ).toBeNull();
  });
});

describe("agent-driver vs human identity (#0764)", () => {
  function req(headers: Record<string, string>, remote = "127.0.0.1"): IncomingMessage {
    return { headers, socket: { remoteAddress: remote } } as unknown as IncomingMessage;
  }

  it("treats a request without the local token as the human path (no restriction)", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-budget-token-"));
    try {
      expect(requestUsedLocalCliToken(req({}), root, ".repoos")).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects a loopback CLI caller carrying the server's token", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-budget-token-"));
    try {
      const token = writeLocalCliToken(root, ".repoos");
      expect(token).toBeTruthy();
      expect(
        requestUsedLocalCliToken(req({ "x-repoos-local-token": token! }), root, ".repoos"),
      ).toBe(true);
      // A forwarded request (through the tunnel) is never the local CLI.
      expect(
        requestUsedLocalCliToken(
          req({ "x-repoos-local-token": token!, "x-forwarded-for": "203.0.113.7" }),
          root,
          ".repoos",
        ),
      ).toBe(false);
      // A non-loopback peer is rejected even with the right token.
      expect(
        requestUsedLocalCliToken(
          req({ "x-repoos-local-token": token! }, "10.0.0.5"),
          root,
          ".repoos",
        ),
      ).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
