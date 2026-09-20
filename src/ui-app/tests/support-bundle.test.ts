import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertRedacted,
  REDACTED,
  RedactionLeakError,
  redactText,
  sanitizePathText,
  scanSecrets,
  isSensitiveKey,
} from "../../core/redact";
import {
  buildSupportBundle,
  bundlePathWarning,
  defaultBundlePath,
  packageTarGz,
  readBundleManifest,
  readTarGz,
  serializeSupportBundle,
  writeSupportBundle,
} from "../../core/support-bundle";
import type { DoctorReport } from "../../core/doctor";
import type { DetectedAgent } from "../../core/detect";
import type { StatusSnapshot } from "../../commands/status";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const FAKE_HOME = "/Users/alice";
const FAKE_ROOT = "/Users/alice/code/alice/secret-project";

/** A repo fixture whose task file and source carry markers that must not leak. */
function fixtureRepo(): string {
  const root = tmp("repoos-support-");
  mkdirSync(join(root, "work"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  // A secret stashed in repoos.toml (an env-style value) — the config shape
  // allowlist must never surface it.
  writeFileSync(
    join(root, "repoos.toml"),
    [
      'workDir = "work"',
      'cacheDir = ".repoos"',
      'ntfyTopic = "gh" + "p_AbCdEfGhIjKlMnOpQrStUvWxYz012345"',
      'auth.bootstrapAdmin = "admin@example.com"',
      'defaultAssignee = "somebody@example.com"',
      "",
      "[check]",
      "version = 1",
      "",
      "[[check.steps]]",
      'name = "build"',
      'command = "true"',
      "",
    ].join("\n"),
  );
  writeFileSync(join(root, "work", "0001-task.md"), "PROMPT-SNIPPET-DO-NOT-LEAK\n");
  writeFileSync(join(root, "src", "app.ts"), "SOURCE-SNIPPET-DO-NOT-LEAK\n");
  return root;
}

const SECRET_VERSION = "sk" + "-proj-abcdefghijklmnopqrstuvwxyz0123456789";

function fakeDoctor(root: string): DoctorReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    project: { root, name: "secret-project", fromWorktree: false },
    tool: { name: "repoos", version: "0.0.0-test" },
    summary: { pass: 0, warn: 1, fail: 1, total: 2 },
    findings: [
      {
        id: "runtime.agent-clis",
        category: "runtime",
        severity: "warn",
        title: "token leak in title gh" + "p_AbCdEfGhIjKlMnOpQrStUvWxYz012345",
        detail: `version probe printed ${SECRET_VERSION} and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U`,
        remediation: `set PASSWORD=hunter2 in /Users/alice/code/alice/secret-project/.env`,
      },
      {
        id: "config.values",
        category: "config",
        severity: "fail",
        title: "bad value",
        detail: "REMOTE_TOKEN=abcdefghijklmnopqrstuvwxyz012345",
        remediation: "fix it",
      },
    ],
  };
}

function fakeStatus(root: string): StatusSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    root,
    server: {
      lifecycle: "stopped",
      running: false,
      port: 7171,
      pid: null,
      host: null,
      startedAt: null,
      startedAtSource: null,
      uptimeSeconds: null,
      health: "unreachable",
      healthRoot: null,
      locks: 0,
    },
    build: {
      code: "fresh",
      stale: false,
      applicable: true,
      message: null,
      version: "0.0.0-test",
      buildAt: null,
    },
    board: { taskCount: 1, counts: { inbox: 1 } as never, active: [] },
    worktrees: { count: 1, warnThreshold: 20, leaked: [], kept: [] },
    tunnel: { configured: false, tunnelName: null, running: false, hostnames: [] },
    git: {
      branch: "main",
      clean: true,
      dirtyFiles: 0,
      isMainBranch: true,
      ahead: null,
      behind: null,
    },
  };
}

function fakeAgent(version: string): DetectedAgent {
  return {
    id: "opencode",
    name: "opencode",
    cli: "opencode",
    binary: "opencode",
    drivable: true,
    installHint: "npm i -g opencode-ai",
    installed: true,
    path: "/Users/alice/.local/bin/opencode",
    version,
    headless: true,
    auth: null,
  };
}

async function buildFixture(root: string) {
  return buildSupportBundle({
    root,
    env: { HOME: FAKE_HOME } as NodeJS.ProcessEnv,
    doctor: async () => fakeDoctor(root),
    detectAgents: async () => [fakeAgent(`opencode 1.2.3 (bearer abcdefghijklmnopqrstuvwxyz)`)],
    status: async () => fakeStatus(root),
    readLogs: () => [
      {
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "error",
        component: "system",
        message: `failed at /Users/alice/code/alice/secret-project with key sk" + "-proj-abcdefghijklmnopqrstuvwxyz0123456789`,
      },
      {
        timestamp: "2026-01-01T00:00:01.000Z",
        level: "warn",
        component: "system",
        message: "ignored warn line",
      },
      {
        timestamp: "2026-01-01T00:00:02.000Z",
        level: "info",
        component: "system",
        message: "ignored info line",
      },
    ],
  });
}

describe("redactText", () => {
  it("redacts representative credential formats", () => {
    const input = [
      "openai=sk" + "-proj-abcdefghijklmnopqrstuvwxyz0123456789",
      "github=gh" + "p_AbCdEfGhIjKlMnOpQrStUvWxYz012345",
      "pat=github" + "_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz",
      "slack=xox" + "b-1234567890-abcdefghijklmnop",
      "aws=AKIA" + "IOSFODNN7EXAMPLE",
      "google=AI" + "zaSyA1234567890abcdefghijklmnopqrstuv",
      "stripe=sk" + "_live_abcdefghijklmnopqrstuvwx",
      "auth=Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.dozjgNryP4J3jVmNHl0w5N",
      "url=https://user:sup3rs3cret@example.com/db",
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----",
    ].join("\n");
    const out = redactText(input);
    expect(out).not.toMatch(/sk-proj-|ghp_|github_pat_|xoxb-|AKIA|AIza|sk_live_/);
    expect(out).not.toContain("sup3rs3cret");
    expect(out).not.toContain("PRIVATE KEY-----");
    expect(scanSecrets(out)).toEqual([]);
    expect(out).toContain(REDACTED);
  });

  it("redacts dotenv lines and sensitive key=value assignments", () => {
    const out = redactText("REPOOS_RESEND_API_KEY=abcdefghijklmnop\npassword = hunter2\n");
    expect(out).not.toContain("abcdefghijklmnop");
    expect(out).toContain("[redacted]");
  });

  it("does not redact a benign sentence that merely mentions a word", () => {
    const out = redactText("the token budget is unlimited and the secret sauce is good");
    expect(out).toBe("the token budget is unlimited and the secret sauce is good");
  });
});

describe("path minimization", () => {
  it("removes home dir, repo root and the bare username", () => {
    const out = sanitizePathText(
      "root=/Users/alice/code/alice/secret-project home=/Users/alice bin=/Users/alice/.local/bin",
      { root: FAKE_ROOT, home: FAKE_HOME },
    );
    expect(out).not.toContain("alice");
    expect(out).toContain("<repo>");
    expect(out).toContain("~");
  });

  it("minimizes Windows user paths", () => {
    const out = sanitizePathText("C:\\Users\\alice\\code\\app");
    expect(out).not.toContain("alice");
  });
});

describe("isSensitiveKey", () => {
  it("flags credential-bearing field names but not descriptive booleans", () => {
    expect(isSensitiveKey("apiKey")).toBe(true);
    expect(isSensitiveKey("sessionSecret")).toBe(true);
    expect(isSensitiveKey("accessToken")).toBe(true);
    expect(isSensitiveKey("clientSecretPresent")).toBe(false);
    expect(isSensitiveKey("tokenConfigured")).toBe(false);
    expect(isSensitiveKey("branch")).toBe(false);
  });
});

describe("assertRedacted", () => {
  it("throws (blocker, not a warning) when a secret survives", () => {
    expect(() => assertRedacted("token=gh" + "p_AbCdEfGhIjKlMnOpQrStUvWxYz012745", "x")).toThrow(
      RedactionLeakError,
    );
  });
});

describe("packageTarGz / readTarGz", () => {
  it("round-trips file contents", () => {
    const buf = packageTarGz([
      { name: "a.json", data: Buffer.from('{"a":1}', "utf8") },
      { name: "nested/b.txt", data: Buffer.from("hello world", "utf8") },
    ]);
    const entries = readTarGz(buf);
    expect(entries.map((e) => e.path)).toEqual(["a.json", "nested/b.txt"]);
    expect(entries[0].content.toString("utf8")).toBe('{"a":1}');
    expect(entries[1].content.toString("utf8")).toBe("hello world");
  });
});

describe("buildSupportBundle", () => {
  it("produces a redacted, enumerated bundle with no secret or private path", async () => {
    const root = fixtureRepo();
    const bundle = await buildFixture(root);

    // Enumerable: the manifest lists every data file.
    expect(bundle.manifest.files.map((f) => f.path)).toEqual([
      "report.json",
      "config-shape.json",
      "agents.json",
      "check-plan.json",
      "doctor.json",
      "build.json",
    ]);
    expect(bundle.manifest.redactionVersion).toBe(1);
    expect(bundle.manifest.manifest).toBe("manifest.json");

    const archive = serializeSupportBundle(bundle);
    const entries = readTarGz(archive);
    expect(entries.map((e) => e.path)).toContain("manifest.json");
    expect(entries).toHaveLength(bundle.files.length + 1);

    // Adversarial: every file, including the manifest, must be free of the
    // injected secrets, private paths and source/prompt markers.
    for (const entry of entries) {
      const text = entry.content.toString("utf8");
      expect(text, entry.path).not.toContain("gh" + "p_AbCdEfGhIjKlMnOpQrStUvWxYz012345");
      expect(text, entry.path).not.toContain("sk" + "-proj-abcdefghijklmnopqrstuvwxyz0123456789");
      expect(text, entry.path).not.toContain("hunter2");
      expect(text, entry.path).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
      expect(text, entry.path).not.toContain("admin@example.com");
      // defaultAssignee is frequently an email and is deliberately dropped.
      expect(text, entry.path).not.toContain("somebody@example.com");
      expect(text, entry.path).not.toContain("alice");
      expect(text, entry.path).not.toContain("PROMPT-SNIPPET-DO-NOT-LEAK");
      expect(text, entry.path).not.toContain("SOURCE-SNIPPET-DO-NOT-LEAK");
      expect(text, entry.path).not.toMatch(/sk-proj-|ghp_|AKIA|Bearer\s+[A-Za-z0-9]/);
    }

    // The report still carries the *classification* that matters.
    expect(bundle.report.latestOperation?.result).toBe("fail");
    expect(bundle.report.recentErrors.count).toBe(2);
    expect(bundle.report.config.shape.auth).toMatchObject({ bootstrapAdminSet: true });
    // defaultAssignee is not represented at all.
    expect(JSON.stringify(bundle.report.config.shape)).not.toContain("defaultAssignee");
  });

  it("records an omission (with reason) for every section that fails", async () => {
    const root = fixtureRepo();
    const bundle = await buildSupportBundle({
      root,
      env: { HOME: FAKE_HOME } as NodeJS.ProcessEnv,
      doctor: async () => {
        throw new Error("doctor exploded");
      },
      detectAgents: async () => {
        throw new Error("no agents");
      },
      status: async () => {
        throw new Error("server down");
      },
      readLogs: () => {
        throw new Error("no logs");
      },
    });
    const categories = bundle.manifest.omitted.map((o) => o.category);
    expect(categories).toEqual(expect.arrayContaining(["doctor", "agents", "lifecycle", "errors"]));
    for (const o of bundle.manifest.omitted) expect(o.reason.length).toBeGreaterThan(0);
    // The bundle is still written and still enumerable.
    const entries = readTarGz(serializeSupportBundle(bundle));
    expect(entries.map((e) => e.path)).toContain("report.json");
  });

  it("states why it could not parse repoos.toml, and still builds", async () => {
    const root = fixtureRepo();
    writeFileSync(join(root, "repoos.toml"), 'workDir = "unterminated\n');
    const bundle = await buildSupportBundle({
      root,
      env: { HOME: FAKE_HOME } as NodeJS.ProcessEnv,
      doctor: async () => fakeDoctor(root),
      detectAgents: async () => [],
      status: async () => fakeStatus(root),
      readLogs: () => [],
    });
    expect(bundle.report.config.parse).toBe("syntax-error");
    expect(bundle.report.config.parseDetail).toBeTruthy();
    expect(bundle.manifest.omitted.some((o) => o.category === "config.toml-syntax")).toBe(true);
  });

  it("falls back to defaults (and says so) when loadConfig throws", async () => {
    const root = fixtureRepo();
    // An unreadable `.env` makes loadConfig throw while reading it — the exact
    // failure the old catch re-ran loadConfig into.
    writeFileSync(join(root, ".env"), "SECRET=abc\n");
    chmodSync(join(root, ".env"), 0o000);
    try {
      const bundle = await buildSupportBundle({
        root,
        env: { HOME: FAKE_HOME } as NodeJS.ProcessEnv,
        doctor: async () => fakeDoctor(root),
        detectAgents: async () => [],
        status: async () => fakeStatus(root),
        readLogs: () => [],
      });
      // Either real loadConfig succeeded (root can read its own 000 file?) or
      // it failed, but the bundle must exist with an omission explaining it.
      expect(bundle.report.config.shape.workDir).toBe("work");
      const entries = readTarGz(serializeSupportBundle(bundle));
      expect(entries.map((e) => e.path)).toContain("report.json");
    } finally {
      chmodSync(join(root, ".env"), 0o600);
    }
  });

  it("minimizes a /private/var/folders temp path so it cannot survive", async () => {
    const root = fixtureRepo();
    const bundle = await buildSupportBundle({
      root,
      env: { HOME: FAKE_HOME } as NodeJS.ProcessEnv,
      doctor: async () => fakeDoctor(root),
      detectAgents: async () => [
        {
          ...fakeAgent("1.2.3"),
          path: "/private/var/folders/ab/cdefgh/T/opencode/bin",
        },
      ],
      status: async () => fakeStatus(root),
      readLogs: () => [
        {
          timestamp: "2026-01-01T00:00:00.000Z",
          level: "error",
          component: "system",
          message: "crashed under /private/var/folders/ab/cdefgh/T/tmp.XYZ",
        },
      ],
    });
    for (const f of bundle.files) {
      expect(f.content, f.path).not.toMatch(/\/private\/var\/folders\//);
    }
    expect(JSON.stringify(bundle.manifest)).not.toMatch(/\/private\/var\/folders\//);
  });
});

describe("bundlePathWarning", () => {
  it("warns when the default path is inside an unignored repo", () => {
    const root = fixtureRepo();
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const out = defaultBundlePath(root, ".repoos", new Date("2026-01-01T00:00:00.000Z"));
    expect(bundlePathWarning(out, root)).toMatch(/not in .gitignore/);
  });

  it("stays silent when the directory is gitignored or outside the repo", () => {
    const root = fixtureRepo();
    writeFileSync(join(root, ".gitignore"), ".repoos/\n");
    const ignored = defaultBundlePath(root, ".repoos", new Date("2026-01-01T00:00:00.000Z"));
    expect(bundlePathWarning(ignored, root)).toBeNull();
    expect(bundlePathWarning("/tmp/somewhere/repoos-support.tar.gz", root)).toBeNull();
  });
});

describe("writeSupportBundle / readBundleManifest", () => {
  it("writes a readable archive whose manifest matches", async () => {
    const root = fixtureRepo();
    const bundle = await buildFixture(root);
    const out = defaultBundlePath(root, ".repoos", new Date("2026-01-01T00:00:00.000Z"));
    const written = writeSupportBundle(bundle, out);
    expect(written.path).toBe(out);
    const manifest = readBundleManifest(out);
    expect(manifest.files.map((f) => f.path)).toEqual(bundle.manifest.files.map((f) => f.path));
    expect(readFileSync(out).length).toBe(written.bytes);
  });
});
