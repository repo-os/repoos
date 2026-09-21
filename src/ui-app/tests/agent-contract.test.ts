import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runAdapterContract } from "../../core/agent-contract";

const FAKE_OPENCODE = `#!/usr/bin/env node
// Fixture opencode binary for the adapter contract suite. Proves the shapes
// RepoOS relies on (agents.ts): --version, --help, models listing, and a
// headless \`run --format json\` that streams one event per line and requires
// --auto. Cancellation probes SIGTERM this process, which node handles by
// terminating immediately. Set REPOOS_CONTRACT_BROKEN=1 to simulate a harness
// that starts but streams garbage.
const fs = require("fs");
const log = process.env.REPOOS_CONTRACT_LOG;
if (log) {
  try { fs.appendFileSync(log, JSON.stringify(process.argv.slice(2)) + "\\n"); } catch {}
}
const sub = process.argv[2];
if (sub === "--version") { process.stdout.write("opencode v2.4.1\\n"); process.exit(0); }
if (sub === "--help") { process.stdout.write("Usage: opencode [command]\\n\\nCommands: run, serve, auth, models\\n"); process.exit(0); }
if (sub === "models") { process.stdout.write("opencode-go/big-pickle\\nopencode-go/mimo-v2.5\\n"); process.exit(0); }
if (sub === "run") {
  if (!process.argv.includes("--auto")) { process.stderr.write("missing --auto\\n"); process.exit(2); }
  if (process.env.REPOOS_CONTRACT_BROKEN === "1") {
    process.stdout.write("this is not a JSON event stream\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ type: "session.id", sessionID: "sess-123" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "step_start", sessionID: "sess-123", part: { type: "step_start" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "text", sessionID: "sess-123", part: { type: "text", text: "OK" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "step_finish", sessionID: "sess-123", part: { type: "step_finish" } }) + "\\n");
  // Stay alive briefly so the cancellation probe can SIGTERM us mid-run.
  setTimeout(() => process.exit(0), 1000);
  return;
}
process.stdout.write("unknown subcommand: " + sub + "\\n");
process.exit(1);
`;

interface Fixture {
  bin: string;
  dir: string;
  log: string;
  clean: () => void;
}

const fixtures: Fixture[] = [];

function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "repoos-contract-test-"));
  const bin = join(dir, "opencode");
  writeFileSync(bin, FAKE_OPENCODE, { mode: 0o755 });
  const fx: Fixture = {
    bin,
    dir,
    log: join(dir, "argv.log"),
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
  fixtures.push(fx);
  return fx;
}

function readSpawnLog(fx: Fixture): string[][] {
  if (!existsSync(fx.log)) return [];
  return readFileSync(fx.log, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as string[]);
}

afterAll(() => {
  for (const fx of fixtures) fx.clean();
  delete process.env.REPOOS_CONTRACT_LOG;
  delete process.env.REPOOS_CONTRACT_BROKEN;
});

describe("adapter contract suite", () => {
  it("passes every seam against a deterministic fixture opencode v2 binary", async () => {
    const fx = makeFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    const result = await runAdapterContract({
      cli: "opencode",
      bin: fx.bin,
      mode: "fixture",
    });
    delete process.env.REPOOS_CONTRACT_LOG;

    expect(result.passed).toBe(true);
    expect(result.mode).toBe("fixture");
    expect(result.evidence).toContain("adapter contract suite passed 8/8");
    const ids = result.capabilities.map((c) => c.id);
    expect(ids).toEqual([
      "version",
      "help",
      "model-discovery",
      "headless-one-shot",
      "structured-events",
      "auto-permissions",
      "session-continuation",
      "cancellation",
    ]);
    for (const cap of result.capabilities) {
      expect(cap.ok, `${cap.id} should pass: ${cap.detail}`).toBe(true);
    }
  });

  it("drives the documented invocation shapes (--auto one-shot, --session resume)", async () => {
    const fx = makeFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    await runAdapterContract({ cli: "opencode", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_LOG;

    const runs = readSpawnLog(fx).filter((args) => args[0] === "run");
    const firstRun = runs.find((args) => !args.includes("--session"));
    const resume = runs.find((args) => args.includes("--session"));
    expect(firstRun).toBeDefined();
    expect(firstRun).toContain("--format");
    expect(firstRun).toContain("--dir");
    expect(firstRun).toContain("--auto");
    expect(resume).toBeDefined();
    expect(resume).toContain("sess-123"); // the session id the fixture emitted
  });

  it("reports honest per-seam failures when the harness starts but streams garbage", async () => {
    const fx = makeFixture();
    process.env.REPOOS_CONTRACT_BROKEN = "1";
    const result = await runAdapterContract({ cli: "opencode", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_BROKEN;

    expect(result.passed).toBe(false);
    const byId = new Map(result.capabilities.map((c) => [c.id, c]));
    // A harness whose one-shot streams garbage must fail every seam downstream
    // of that run — but independent seams that still work stay honest.
    expect(byId.get("headless-one-shot")?.ok).toBe(false);
    expect(byId.get("structured-events")?.ok).toBe(false);
    expect(byId.get("auto-permissions")?.ok).toBe(false);
    expect(byId.get("session-continuation")?.ok).toBe(false);
    expect(byId.get("version")?.ok).toBe(true);
    expect(byId.get("help")?.ok).toBe(true);
    expect(byId.get("model-discovery")?.ok).toBe(true);
    // The broken fixture exits on its own before SIGTERM lands, so cancellation
    // is honestly "not exercised" rather than a false pass (and must not stall
    // for the full waitForExit window).
    expect(byId.get("cancellation")?.ok).toBe(false);
    expect(byId.get("cancellation")?.detail).toMatch(/not exercised/i);
    expect(result.evidence).toBeNull();
  });

  it("degrades gracefully for a harness with no registered templates", async () => {
    // kiro has a KNOWN_AGENTS entry but no contract templates yet — the
    // framework is opencode-first. It must say so, not crash.
    const result = await runAdapterContract({ cli: "kiro", mode: "fixture" });
    expect(result.passed).toBe(false);
    expect(result.capabilities[0].detail).toMatch(/no contract command templates/i);
  });

  it("degrades gracefully when the binary is missing", async () => {
    const result = await runAdapterContract({
      cli: "opencode",
      bin: join(tmpdir(), "definitely-not-an-opencode"),
      mode: "fixture",
    });
    expect(result.passed).toBe(false);
    expect(result.capabilities[0].detail).toMatch(/not found/);
  });

  it("never removes a caller-provided working directory", async () => {
    const fx = makeFixture();
    const workDir = mkdtempSync(join(tmpdir(), "repoos-contract-cwd-"));
    try {
      await runAdapterContract({
        cli: "opencode",
        bin: fx.bin,
        mode: "fixture",
        workDir,
      });
      expect(existsSync(workDir)).toBe(true);
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
