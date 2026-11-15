/**
 * #1132 — allowlist groups: merge semantics, the machine-local store, tailnet
 * member discovery/propagation, and the guarantee that one group's pause never
 * touches another group.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { getConfigSchema, loadConfig, SUPPORTED_TOML_KEYS } from "../../core/config.js";
import {
  allowlistDrift,
  allowlistSources,
  allowlistGroupPath,
  isNewerGroup,
  mergeAllowlistRows,
  normalizeAllowlistGroupName,
  normalizeAllowlistGroupPayload,
  projectRowsAfterResync,
  readAllowlistGroup,
  serializeAllowlistGroup,
  withGroupMutation,
  writeAllowlistGroup,
  type AllowlistGroup,
} from "../../core/allowlist-groups.js";
import {
  classifyGroupApplyFailure,
  groupApplyCommand,
  groupMembersFromServers,
  parseGroupApplyOutput,
  propagateAllowlistGroup,
} from "../../core/allowlist-group-sync.js";
import { mutateAllowlistGroup } from "../../server/routes/budget-allowlist-groups.js";
import { patchConfig } from "../../server/routes/config.js";
import type { AgentModelAllowRow } from "../../core/types.js";

const GROUP: AgentModelAllowRow[] = [
  { cli: "codex", models: ["gpt-6", "gpt-6.1-terra"] },
  { cli: "claude code", models: ["sonnet"] },
];

describe("merge group + project allowlists (#1132)", () => {
  it.each([
    {
      name: "no group returns the project rows unchanged",
      group: [],
      project: [{ cli: "opencode", models: ["big pickle"] }],
      expected: [{ cli: "opencode", models: ["big pickle"] }],
    },
    {
      name: "group only is the group's list",
      group: GROUP,
      project: [],
      expected: GROUP,
    },
    {
      name: "a project row unions its models onto the group row",
      group: GROUP,
      project: [{ cli: "codex", models: ["gpt-6.1-terra", "gpt-6.2"] }],
      expected: [
        { cli: "codex", models: ["gpt-6", "gpt-6.1-terra", "gpt-6.2"] },
        { cli: "claude code", models: ["sonnet"] },
      ],
    },
    {
      name: "a project-only agent is appended",
      group: GROUP,
      project: [{ cli: "opencode", models: ["big pickle"] }],
      expected: [...GROUP, { cli: "opencode", models: ["big pickle"] }],
    },
    {
      name: "a group pause survives a project row that does not pause",
      group: [
        { cli: "codex", models: ["gpt-6"], paused: true, pausedUntil: "2027-01-01T00:00:00Z" },
      ],
      project: [{ cli: "codex", models: ["gpt-6"] }],
      expected: [
        { cli: "codex", models: ["gpt-6"], paused: true, pausedUntil: "2027-01-01T00:00:00Z" },
      ],
    },
    {
      name: "a project pause and reason layer onto an unpaused group row",
      group: [{ cli: "claude code", models: ["sonnet"] }],
      project: [{ cli: "claude code", models: ["sonnet"], paused: true, pausedReason: "quota" }],
      expected: [{ cli: "claude code", models: ["sonnet"], paused: true, pausedReason: "quota" }],
    },
    {
      name: "per-model pauses merge by model with the project winning",
      group: [
        {
          cli: "codex",
          models: ["gpt-6", "gpt-6.1-terra"],
          pausedModels: [{ model: "gpt-6", pausedReason: "group" }],
        },
      ],
      project: [
        {
          cli: "codex",
          models: ["gpt-6"],
          pausedModels: [{ model: "gpt-6", pausedReason: "project" }],
        },
      ],
      expected: [
        {
          cli: "codex",
          models: ["gpt-6", "gpt-6.1-terra"],
          pausedModels: [{ model: "gpt-6", pausedReason: "project" }],
        },
      ],
    },
  ])("$name", ({ group, project, expected }) => {
    expect(mergeAllowlistRows(group, project)).toEqual(expected);
  });

  it("reports where each entry came from", () => {
    const sources = allowlistSources(GROUP, [
      { cli: "codex", models: ["gpt-6"] },
      { cli: "opencode", models: ["big pickle"] },
    ]);
    expect(sources).toEqual({
      codex: "project",
      "claude code": "group",
      opencode: "project",
    });
  });

  it("warns on drift and re-sync drops only overridden group rows", () => {
    const project = [
      { cli: "codex", models: ["gpt-6"], paused: true },
      { cli: "opencode", models: ["big pickle"] },
    ];
    const drift = allowlistDrift(GROUP, project);
    expect(drift.map((entry) => entry.cli)).toEqual(["codex", "opencode"]);
    expect(drift[0]!.detail).toMatch(/local pause override/);
    expect(projectRowsAfterResync(GROUP, project)).toEqual([
      { cli: "opencode", models: ["big pickle"] },
    ]);
  });

  it("treats a project without overrides as in sync", () => {
    expect(allowlistDrift(GROUP, [])).toEqual([]);
    expect(allowlistDrift([], [{ cli: "opencode", models: ["big pickle"] }])).toHaveLength(1);
  });
});

describe("machine-local group store (#1132)", () => {
  let dir: string;
  const env: NodeJS.ProcessEnv = {};

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "repoos-allowlist-groups-"));
    env.REPOOS_ALLOWLIST_GROUPS_DIR = dir;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips a group through TOML without losing pause state", () => {
    const group: AllowlistGroup = {
      name: "personal",
      version: 3,
      updatedAt: "2026-11-16T10:00:00.000Z",
      allowlist: [
        {
          cli: "codex",
          models: ["gpt-6", "gpt-6.1-terra"],
          paused: true,
          pausedUntil: "2026-11-20T12:00:00.000Z",
          pausedReason: 'quoted "reason" with #hash',
          pausedModels: [{ model: "gpt-6", pausedReason: "older" }],
        },
      ],
    };
    writeAllowlistGroup(group, env);
    expect(readAllowlistGroup("personal", env)).toEqual(group);
    expect(serializeAllowlistGroup(group)).not.toMatch(/apiKey|secret|token/i);
  });

  it("uses a stable filename and rejects path traversal", () => {
    expect(allowlistGroupPath("acme", env)).toBe(join(dir, "acme.toml"));
    expect(() => allowlistGroupPath("../evil", env)).toThrow(/invalid allowlist group/);
    expect(normalizeAllowlistGroupName("../evil")).toBeUndefined();
    expect(normalizeAllowlistGroupName("  personal ")).toBe("personal");
  });

  it("is missing rather than invalid when the group has no file yet", () => {
    expect(readAllowlistGroup("personal", env)).toBeNull();
    expect(readAllowlistGroup("../../etc/passwd", env)).toBe("invalid");
  });

  it("reads a corrupt group file as invalid, not as an empty allowlist", () => {
    writeFileSync(allowlistGroupPath("personal", env), "name = [not toml\n", "utf8");
    expect(readAllowlistGroup("personal", env)).toBe("invalid");
  });

  it("newest updatedAt wins, with version as the tie-breaker", () => {
    const older: AllowlistGroup = {
      name: "personal",
      version: 9,
      updatedAt: "2026-11-16T09:00:00.000Z",
      allowlist: [],
    };
    const newer: AllowlistGroup = {
      name: "personal",
      version: 2,
      updatedAt: "2026-11-16T10:00:00.000Z",
      allowlist: [],
    };
    expect(isNewerGroup(newer, older)).toBe(true);
    expect(isNewerGroup(older, newer)).toBe(false);
    expect(isNewerGroup({ ...older, version: 10, updatedAt: older.updatedAt }, older)).toBe(true);
    expect(isNewerGroup(older, null)).toBe(true);
  });

  it("bumps version and updatedAt on a mutation", () => {
    const group: AllowlistGroup = {
      name: "personal",
      version: 1,
      updatedAt: "2026-11-16T09:00:00.000Z",
      allowlist: GROUP,
    };
    const next = withGroupMutation(group, GROUP, new Date("2026-11-16T11:00:00.000Z"));
    expect(next.version).toBe(2);
    expect(next.updatedAt).toBe("2026-11-16T11:00:00.000Z");
  });

  it("validates an incoming payload and refuses another group's state", () => {
    const valid = normalizeAllowlistGroupPayload({
      group: { name: "acme", version: 1, updatedAt: "2026-11-16T10:00:00Z", allowlist: GROUP },
    });
    expect(typeof valid).not.toBe("string");
    expect(
      normalizeAllowlistGroupPayload(
        {
          group: { name: "acme", version: 1, updatedAt: "2026-11-16T10:00:00Z", allowlist: GROUP },
        },
        "personal",
      ),
    ).toMatch(/this project is in "personal"/);
    expect(normalizeAllowlistGroupPayload({ group: { name: "acme", allowlist: GROUP } })).toMatch(
      /updatedAt/,
    );
  });
});

describe("config loading with a group (#1132)", () => {
  let root: string;
  let dir: string;
  const previous = process.env.REPOOS_ALLOWLIST_GROUPS_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-group-repo-"));
    dir = mkdtempSync(join(tmpdir(), "repoos-group-store-"));
    process.env.REPOOS_ALLOWLIST_GROUPS_DIR = dir;
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.REPOOS_ALLOWLIST_GROUPS_DIR;
    else process.env.REPOOS_ALLOWLIST_GROUPS_DIR = previous;
  });

  function writeRepo(toml: string): void {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
  }

  it("merges the group base with project overrides", () => {
    writeAllowlistGroup({
      name: "personal",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: GROUP,
    });
    writeRepo(`budget.allowlistGroup = "personal"

[[budget.allowlist]]
cli = "codex"
models = ["gpt-6.2"]

[[budget.allowlist]]
cli = "opencode"
models = ["big pickle"]
`);
    const cfg = loadConfig(root);
    expect(cfg.budget?.allowlistGroup).toBe("personal");
    expect(cfg.budget?.allowlist).toEqual([
      { cli: "codex", models: ["gpt-6", "gpt-6.1-terra", "gpt-6.2"] },
      { cli: "claude code", models: ["sonnet"] },
      { cli: "opencode", models: ["big pickle"] },
    ]);
  });

  it("keeps project-only behaviour when no group is declared", () => {
    writeRepo(`[[budget.allowlist]]
cli = "opencode"
models = ["big pickle"]
`);
    const cfg = loadConfig(root);
    expect(cfg.budget?.allowlistGroup).toBeUndefined();
    expect(cfg.budget?.allowlist).toEqual([{ cli: "opencode", models: ["big pickle"] }]);
  });

  it("falls back to project rows when the group file is corrupt", () => {
    writeFileSync(
      allowlistGroupPath("personal", { REPOOS_ALLOWLIST_GROUPS_DIR: dir }),
      "???",
      "utf8",
    );
    writeRepo(`budget.allowlistGroup = "personal"

[[budget.allowlist]]
cli = "opencode"
models = ["big pickle"]
`);
    const cfg = loadConfig(root);
    expect(cfg.budget?.allowlistGroup).toBe("personal");
    expect(cfg.budget?.allowlist).toEqual([{ cli: "opencode", models: ["big pickle"] }]);
  });

  it("a change in group A leaves a group B project untouched", () => {
    writeAllowlistGroup({
      name: "acme",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: [{ cli: "codex", models: ["gpt-6"] }],
    });
    writeAllowlistGroup({
      name: "personal",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: [{ cli: "claude code", models: ["sonnet"] }],
    });
    const otherRoot = mkdtempSync(join(tmpdir(), "repoos-group-b-"));
    try {
      writeFileSync(join(otherRoot, "repoos.toml"), 'budget.allowlistGroup = "personal"\n');
      const before = loadConfig(otherRoot);
      // Pause codex in group A only.
      const a = readAllowlistGroup("acme") as AllowlistGroup;
      writeAllowlistGroup(
        withGroupMutation(a, [{ cli: "codex", models: ["gpt-6"], paused: true }]),
      );
      const after = loadConfig(otherRoot);
      expect(after.budget?.allowlist).toEqual(before.budget?.allowlist);
      expect(after.budget?.allowlist).toEqual([{ cli: "claude code", models: ["sonnet"] }]);
    } finally {
      rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  it("is a documented, schema-backed config key", () => {
    expect(SUPPORTED_TOML_KEYS).toContain("budget.allowlistGroup");
    expect(getConfigSchema().find((field) => field.key === "budget.allowlistGroup")).toMatchObject({
      type: "string",
      tier: "live",
      restartRequired: false,
    });
  });

  async function patch(body: Record<string, unknown>): Promise<{
    status: number;
    payload: Record<string, unknown>;
  }> {
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
      config: cfg,
      repoos: { config: cfg },
      index: { refreshAll() {} },
      logger: { system() {} },
    } as never;
    await patchConfig(ctx, req as never, res as never, {});
    return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
  }

  it("joins and leaves a group through the config route", async () => {
    writeRepo('workDir = "work"\n');
    const joined = await patch({ "budget.allowlistGroup": "personal" });
    expect(joined.status).toBe(200);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).toContain(
      'budget.allowlistGroup = "personal"',
    );
    expect(loadConfig(root).budget?.allowlistGroup).toBe("personal");

    const invalid = await patch({ "budget.allowlistGroup": "../evil" });
    expect(invalid.status).toBe(400);

    const leave = await patch({ "budget.allowlistGroup": "" });
    expect(leave.status).toBe(200);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("allowlistGroup");
    expect(loadConfig(root).budget?.allowlistGroup).toBeUndefined();
  });
});

describe("tailnet propagation (#1132)", () => {
  const group: AllowlistGroup = {
    name: "personal",
    version: 2,
    updatedAt: "2026-11-16T10:00:00Z",
    allowlist: [{ cli: "codex", models: ["gpt-6"], paused: true }],
  };

  it("includes only reachable servers that declare the same group", () => {
    const members = groupMembersFromServers(
      [
        { host: "local", projectName: "repoos", allowlistGroup: "personal" },
        { host: "bee", projectName: "neung", allowlistGroup: "personal" },
        { host: "bee", projectName: "tiao", allowlistGroup: "acme" },
        { host: "thinkpad", projectName: "laisen" },
        { host: "bee", unreachable: true },
      ],
      "personal",
    );
    expect(members.map((member) => member.projectName)).toEqual(["repoos", "neung"]);
    expect(members.map((member) => member.local)).toEqual([true, false]);
  });

  it("quotes the member root in the remote command and carries no secret", () => {
    const command = groupApplyCommand(
      { group, originHost: "local" },
      true,
      "/home/nick/it's here/repo",
    );
    expect(command).toMatch(/^cd '/);
    expect(command).toContain("repoos allowlist group apply --json --payload-base64 ");
    expect(command).toContain("--check-logins");
    const b64 = command.split("--payload-base64 ")[1]!.split(" ")[0]!;
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    expect(JSON.parse(decoded)).toEqual({ group, originHost: "local" });
    expect(decoded).not.toMatch(/apiKey|token|password/i);
  });

  it("reports applied, refused and unreachable per host", async () => {
    const calls: string[] = [];
    const results = await propagateAllowlistGroup(
      group,
      [
        { host: "local", local: true, reachable: true, projectName: "repoos" },
        { host: "bee", local: false, reachable: true, projectName: "neung", root: "/srv/neung" },
        { host: "thinkpad", local: false, reachable: true, projectName: "tiao", root: "/srv/tiao" },
        {
          host: "oldbox",
          local: false,
          reachable: true,
          projectName: "laisen",
          root: "/srv/laisen",
        },
      ],
      "local",
      {
        remoteExec: async (host, _user, _timeout, command) => {
          calls.push(`${host}:${command}`);
          if (host === "bee") {
            return JSON.stringify({
              ok: true,
              applied: true,
              status: "applied",
              notLoggedIn: ["codex"],
            });
          }
          if (host === "thinkpad") {
            return JSON.stringify({
              ok: true,
              applied: false,
              status: "refused",
              reason: "newer local state",
            });
          }
          throw new Error("ssh: connect to host oldbox port 22: Connection refused");
        },
        remoteHosts: [],
        timeoutMs: 1000,
      },
    );
    expect(results.map((result) => result.status)).toEqual([
      "applied",
      "applied",
      "refused",
      "unreachable",
    ]);
    expect(results[1]!.notLoggedIn).toEqual(["codex"]);
    expect(results[2]!.reason).toBe("newer local state");
    // Local members share this machine's file — no SSH for them.
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("cd '/srv/neung'");
  });

  it("classifies transport failures as unreachable and local refusals as refused", () => {
    expect(classifyGroupApplyFailure(new Error("ssh: Could not resolve hostname bee"))).toBe(
      "unreachable",
    );
    expect(classifyGroupApplyFailure(new Error("timed out"))).toBe("unreachable");
    expect(classifyGroupApplyFailure(new Error("allowlist group file is unreadable"))).toBe(
      "refused",
    );
    expect(parseGroupApplyOutput('banner\n{"applied":true}')?.applied).toBe(true);
    expect(parseGroupApplyOutput("not json")).toBeNull();
  });
});

describe("group mutation route (#1132)", () => {
  let root: string;
  let dir: string;
  let registry: string;
  const previousGroupDir = process.env.REPOOS_ALLOWLIST_GROUPS_DIR;
  const previousRegistryDir = process.env.REPOOS_SERVERS_REGISTRY_DIR;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "repoos-group-route-"));
    dir = mkdtempSync(join(tmpdir(), "repoos-group-route-store-"));
    registry = mkdtempSync(join(tmpdir(), "repoos-group-route-registry-"));
    process.env.REPOOS_ALLOWLIST_GROUPS_DIR = dir;
    process.env.REPOOS_SERVERS_REGISTRY_DIR = registry;
    mkdirSync(join(root, ".repoos"), { recursive: true });
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
    rmSync(registry, { recursive: true, force: true });
    if (previousGroupDir === undefined) delete process.env.REPOOS_ALLOWLIST_GROUPS_DIR;
    else process.env.REPOOS_ALLOWLIST_GROUPS_DIR = previousGroupDir;
    if (previousRegistryDir === undefined) delete process.env.REPOOS_SERVERS_REGISTRY_DIR;
    else process.env.REPOOS_SERVERS_REGISTRY_DIR = previousRegistryDir;
  });

  function writeRepo(toml: string): void {
    writeFileSync(join(root, "repoos.toml"), toml, "utf8");
  }

  async function mutate(body: Record<string, unknown>): Promise<{
    status: number;
    payload: Record<string, unknown>;
  }> {
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
      config: cfg,
      repoos: { config: cfg },
      index: { refreshAll() {} },
      logger: { system() {} },
    } as never;
    await mutateAllowlistGroup(ctx, req as never, res as never, {});
    return { status: res.statusCode ?? 0, payload: JSON.parse(res.payload ?? "{}") };
  }

  it("pauses locally without touching another group and keeps the project file clean", async () => {
    writeRepo(`budget.allowlistGroup = "acme"

[[budget.allowlist]]
cli = "codex"
models = ["gpt-6", "gpt-6.1-terra"]
`);
    writeAllowlistGroup({
      name: "personal",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: [{ cli: "claude code", models: ["sonnet"] }],
    });
    const { status, payload } = await mutate({
      action: "pause",
      cli: "codex",
      model: "gpt-6",
      reason: "quota",
      propagate: false,
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    const acme = readAllowlistGroup("acme") as AllowlistGroup;
    expect(acme.allowlist[0]!.pausedModels).toEqual([{ model: "gpt-6", pausedReason: "quota" }]);
    const personal = readAllowlistGroup("personal") as AllowlistGroup;
    expect(personal.allowlist).toEqual([{ cli: "claude code", models: ["sonnet"] }]);
    // Group state stays out of the committed project file.
    const toml = loadConfig(root);
    expect(toml.budget?.allowlist?.[0]?.pausedModels).toEqual([
      { model: "gpt-6", pausedReason: "quota" },
    ]);
    expect(readFileSync(join(root, "repoos.toml"), "utf8")).not.toContain("pausedModels");
  });

  it("resumes a group entry for every member", async () => {
    writeAllowlistGroup({
      name: "acme",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: [{ cli: "codex", models: ["gpt-6"], paused: true, pausedReason: "quota" }],
    });
    writeRepo('budget.allowlistGroup = "acme"\n');
    const { status } = await mutate({ action: "resume", cli: "codex", propagate: false });
    expect(status).toBe(200);
    const acme = readAllowlistGroup("acme") as AllowlistGroup;
    expect(acme.allowlist[0]!.paused).toBeUndefined();
  });

  it("refuses add/remove for an unknown model instead of silently no-oping", async () => {
    writeAllowlistGroup({
      name: "acme",
      version: 1,
      updatedAt: "2026-11-16T10:00:00Z",
      allowlist: [{ cli: "codex", models: ["gpt-6"] }],
    });
    writeRepo('budget.allowlistGroup = "acme"\n');
    const remove = await mutate({ action: "remove", cli: "codex", model: "nope" });
    expect(remove.status).toBe(400);
    const add = await mutate({ action: "add", cli: "codex", model: "gpt-6.2" });
    expect(add.status).toBe(200);
    expect((readAllowlistGroup("acme") as AllowlistGroup).allowlist[0]!.models).toEqual([
      "gpt-6",
      "gpt-6.2",
    ]);
  });
});
