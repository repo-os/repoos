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
  allAllowlistPairsPaused,
  availableAllowPairs,
  describeAllowlistPairs,
  isPairPaused,
  isPairOnAllowlist,
  isPairSelectable,
  normalizeAllowlistRows,
  pairPauseInfo,
  pauseAllowlistEntry,
  resumeAllowlistEntry,
} from "../../core/budget-allowlist.js";
import { patchConfig, safeConfigForBrowser } from "../../server/routes/config.js";
import { overrideRefusal } from "../../server/agent-model-allowlist.js";
import {
  noAgentAvailableMessage,
  pausedAgentFallbackNote,
  resolveAgentForTask,
} from "../../server/agents.js";
import { requestUsedLocalCliToken, writeLocalCliToken } from "../../server/local-token.js";
import type { AgentModelAllowRow, RepoOSConfig, Task } from "../../core/types.js";

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

function configWith(allowlist: AgentModelAllowRow[] | undefined): RepoOSConfig {
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

describe("allowlist pausing (#0850)", () => {
  const FUTURE = "2099-01-01T00:00:00.000Z";
  const PAST = "2020-01-01T00:00:00.000Z";

  it("parses paused rows, per-model pauses and ignores unknown keys", () => {
    const root = repo(`[[budget.allowlist]]
cli = "cursor"
models = ["composer-2.5"]
paused = true
pausedUntil = "${FUTURE}"
pausedReason = "Cursor credits exhausted"
unknownThing = "ignored"

[[budget.allowlist]]
cli = "opencode"
models = ["big pickle", "deepseek v4"]
pausedModels = ["big pickle"]

[[budget.allowlist]]
cli = "claude code"
models = ["sonnet"]
pausedModels = [{ model = "sonnet", pausedReason = "rate limited", pausedUntil = "${FUTURE}" }]
`);
    try {
      expect(loadConfig(root).budget?.allowlist).toEqual([
        {
          cli: "cursor",
          models: ["composer-2.5"],
          paused: true,
          pausedUntil: FUTURE,
          pausedReason: "Cursor credits exhausted",
        },
        {
          cli: "opencode",
          models: ["big pickle", "deepseek v4"],
          pausedModels: [{ model: "big pickle" }],
        },
        {
          cli: "claude code",
          models: ["sonnet"],
          pausedModels: [{ model: "sonnet", pausedUntil: FUTURE, pausedReason: "rate limited" }],
        },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("round-trips pause keys through the config writer", async () => {
    const root = repo();
    try {
      const res = await patch(root, {
        "budget.allowlist": [
          {
            cli: "cursor",
            models: ["composer-2.5"],
            paused: true,
            pausedUntil: FUTURE,
            pausedReason: "credits",
            pausedModels: [{ model: "composer-2.5", pausedReason: "model-level" }],
          },
        ],
      });
      expect(res.status).toBe(200);
      const text = readFileSync(join(root, "repoos.toml"), "utf8");
      expect(text).toContain("paused = true");
      expect(text).toContain("pausedUntil");
      expect(text).toContain('pausedModels = [{ model = "composer-2.5"');
      expect(loadConfig(root).budget?.allowlist?.[0]).toMatchObject({
        cli: "cursor",
        paused: true,
        pausedReason: "credits",
        pausedModels: [{ model: "composer-2.5", pausedReason: "model-level" }],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips paused pairs and auto-resumes once pausedUntil expires", () => {
    const rows = [
      { cli: "cursor", models: ["composer-2.5"], paused: true, pausedUntil: FUTURE },
      {
        cli: "opencode",
        models: ["big pickle"],
        pausedModels: [{ model: "big pickle", pausedUntil: FUTURE }],
      },
      { cli: "claude code", models: ["sonnet"] },
    ];
    expect(isPairSelectable(rows, "cursor", "composer-2.5", Date.now())).toBe(false);
    expect(isPairPaused(rows, "opencode", "big pickle", Date.now())).toBe(true);
    expect(isPairPaused(rows, "opencode", "big pickle", Date.parse("2100-01-01T00:00:00Z"))).toBe(
      false,
    );
    expect(availableAllowPairs(rows, Date.now())).toEqual([
      { cli: "claude code", model: "sonnet" },
    ]);
    expect(describeAllowlistPairs(rows, Date.now())).toContain("cursor + composer-2.5 (paused)");

    const expired = [{ cli: "cursor", models: ["composer-2.5"], paused: true, pausedUntil: PAST }];
    expect(isPairPaused(expired, "cursor", "composer-2.5", Date.now())).toBe(false);
    expect(isPairSelectable(expired, "cursor", "composer-2.5", Date.now())).toBe(true);
  });

  it("treats a default-model selection as paused when the row has a paused model", () => {
    const rows = [{ cli: "opencode", models: ["a", "b"], pausedModels: [{ model: "a" }] }];
    expect(pairPauseInfo(rows, "opencode", "default").paused).toBe(true);
    expect(pairPauseInfo(rows, "opencode", "b").paused).toBe(false);
  });

  it("reports when every allowed pair is paused", () => {
    const rows = [
      { cli: "cursor", models: ["composer-2.5"], paused: true },
      { cli: "opencode", models: ["big pickle"], paused: true },
    ];
    expect(allAllowlistPairsPaused(rows, Date.now())).toBe(true);
    expect(allAllowlistPairsPaused(rows, Date.parse(PAST))).toBe(true);
    expect(allAllowlistPairsPaused([], Date.now())).toBe(false);
  });

  it("pauses and resumes a whole agent and a single model", () => {
    const rows = [
      { cli: "opencode", models: ["big pickle", "deepseek v4"] },
      { cli: "claude code", models: ["sonnet"] },
    ];
    const pausedAgent = pauseAllowlistEntry(rows, {
      cli: "opencode",
      until: FUTURE,
      reason: "credits",
    });
    expect("rows" in pausedAgent).toBe(true);
    if (!("rows" in pausedAgent)) return;
    expect(pausedAgent.rows[0]).toMatchObject({
      paused: true,
      pausedUntil: FUTURE,
      pausedReason: "credits",
    });
    const pausedModel = pauseAllowlistEntry(pausedAgent.rows, {
      cli: "opencode",
      model: "big pickle",
    });
    if (!("rows" in pausedModel)) throw new Error(pausedModel.error);
    expect(pausedModel.rows[0]?.pausedModels).toEqual([{ model: "big pickle" }]);

    const resumedModel = resumeAllowlistEntry(pausedModel.rows, {
      cli: "opencode",
      model: "big pickle",
    });
    if (!("rows" in resumedModel)) throw new Error(resumedModel.error);
    expect(resumedModel.rows[0]?.pausedModels).toBeUndefined();

    const resumedAgent = resumeAllowlistEntry(pausedAgent.rows, { cli: "opencode" });
    if (!("rows" in resumedAgent)) throw new Error(resumedAgent.error);
    expect(resumedAgent.rows[0]).toEqual({
      cli: "opencode",
      models: ["big pickle", "deepseek v4"],
    });
  });

  it("refuses to pause an unknown agent/model or an invalid date", () => {
    const rows = [{ cli: "opencode", models: ["big pickle"] }];
    expect(pauseAllowlistEntry(rows, { cli: "cursor" })).toEqual({
      error: '"cursor" is not on the budget allowlist — add it there before pausing it',
    });
    expect(pauseAllowlistEntry(rows, { cli: "opencode", model: "nope" })).toHaveProperty("error");
    expect(pauseAllowlistEntry(rows, { cli: "opencode", until: "not-a-date" })).toHaveProperty(
      "error",
    );
  });

  it("falls back to the next allowed pair when the default is paused", () => {
    const config = configWith([
      { cli: "opencode", models: ["big pickle"], paused: true, pausedReason: "credits" },
      { cli: "claude code", models: ["sonnet"] },
    ]);
    const selected = resolveAgentForTask(config, task());
    expect(selected).toMatchObject({ name: "engineer", cli: "claude code", model: "sonnet" });
    const note = pausedAgentFallbackNote(config, task());
    expect(note).toContain("opencode + big pickle is paused");
    expect(note).toContain("credits");
    expect(note).toContain("using claude code + sonnet");
  });

  it("falls back when only the engineer's model is paused, and records the swap", () => {
    const config = configWith([
      {
        cli: "opencode",
        models: ["big pickle", "deepseek v4"],
        pausedModels: [{ model: "big pickle", pausedReason: "rate limited" }],
      },
      { cli: "claude code", models: ["sonnet"] },
    ]);
    const selected = resolveAgentForTask(config, task());
    // The configured engineer pair is paused; the next selectable allowlist
    // pair wins (the row's other model, or another agent's pair).
    expect(selected).not.toBeNull();
    expect({ cli: selected?.cli, model: selected?.model }).not.toEqual({
      cli: "opencode",
      model: "big pickle",
    });
    const note = pausedAgentFallbackNote(config, task());
    expect(note).toContain("opencode + big pickle is paused");
    expect(note).toContain("rate limited");
    expect(note).toContain(`using ${selected?.cli} + ${selected?.model}`);
  });

  it("does not report a fallback for a paused pair a human pinned explicitly", () => {
    const config = configWith([
      { cli: "opencode", models: ["big pickle"], paused: true, pausedReason: "credits" },
      { cli: "claude code", models: ["sonnet"] },
    ]);
    const pinned = task({ cliOverride: "opencode", modelOverride: "big pickle" });
    expect(resolveAgentForTask(config, pinned)).toMatchObject({
      cli: "opencode",
      model: "big pickle",
    });
    expect(pausedAgentFallbackNote(config, pinned)).toBeNull();
  });

  it("fails closed with a clear message when all allowed pairs are paused", () => {
    const config = configWith([
      { cli: "opencode", models: ["big pickle"], paused: true },
      { cli: "claude code", models: ["sonnet"], paused: true },
    ]);
    expect(resolveAgentForTask(config, task())).toBeNull();
    expect(noAgentAvailableMessage(config, "engineer")).toContain(
      "All allowed agent+model pairs are paused",
    );
  });

  it("keeps an explicit human override of a paused pair working", () => {
    const config = configWith([
      { cli: "opencode", models: ["big pickle"], paused: true },
      { cli: "claude code", models: ["sonnet"] },
    ]);
    const selected = resolveAgentForTask(
      config,
      task({ cliOverride: "opencode", modelOverride: "big pickle" }),
    );
    expect(selected).toMatchObject({ cli: "opencode", model: "big pickle" });
  });

  it("refuses an agent driver's override of a paused pair", () => {
    const config = configWith([
      { cli: "opencode", models: ["big pickle"], paused: true, pausedReason: "credits" },
    ]);
    const msg = overrideRefusal(config, task(), {
      cliOverride: "opencode",
      modelOverride: "big pickle",
    });
    expect(msg).toBeTruthy();
    expect(msg).toContain("paused");
    expect(msg).toContain("credits");
    expect(msg).toContain("resume");
  });
});
