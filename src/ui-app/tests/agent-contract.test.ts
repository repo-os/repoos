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

const FAKE_CRUSH = `#!/usr/bin/env node
// Fixture crush binary for the adapter contract suite. Crush has no JSON mode:
// 'run --quiet' prints plain assistant text and exits, the session id is only
// available post-run via 'session list --json', and non-interactive runs
// auto-approve with no flag. Cancellation must use SIGINT; node terminates on it.
const fs = require("fs");
const log = process.env.REPOOS_CONTRACT_LOG;
if (log) {
  try { fs.appendFileSync(log, JSON.stringify(process.argv.slice(2)) + "\\n"); } catch {}
}
const args = process.argv.slice(2);
if (args[0] === "--version") { process.stdout.write("crush version v0.97.1\\n"); process.exit(0); }
if (args[0] === "--help") { process.stdout.write("Usage: crush [command]\\n\\nCommands: run\\n"); process.exit(0); }
if (args[0] === "models") { process.stdout.write("aihubmix/DeepSeek-V3\\nopencode-go/big-pickle\\n"); process.exit(0); }
if (args[0] === "run") {
  process.stdout.write("OK\\n");
  // Stay alive briefly so the cancellation probe can signal us mid-run.
  setTimeout(() => process.exit(0), 1000);
  return;
}
process.stdout.write("unknown subcommand: " + args[0] + "\\n");
process.exit(1);
`;

const FAKE_PI = `#!/usr/bin/env node
// Fixture pi binary for the adapter contract suite. pi streams strict JSONL in
// --mode json (session header, message, tool, usage events), lists models with
// --list-models, and does not prompt for approval in a non-interactive run.
// Cancellation probes SIGTERM, which node handles by terminating immediately.
const fs = require("fs");
const log = process.env.REPOOS_CONTRACT_LOG;
const args = process.argv.slice(2);
if (log) {
  try { fs.appendFileSync(log, JSON.stringify(args) + "\\n"); } catch {}
}
if (args.includes("--version")) { process.stdout.write("0.99.2\\n"); process.exit(0); }
if (args.includes("--help")) { process.stdout.write("Usage: pi [options] [messages...]\\n\\nOptions: --mode, --print, --session\\n"); process.exit(0); }
if (args.includes("--list-models")) { process.stdout.write("google/gemini-2.5-pro\\nanthropic/claude-sonnet-4\\n"); process.exit(0); }
if (args.includes("--mode")) {
  process.stdout.write(JSON.stringify({ type: "session", version: 3, id: "sess-123" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "turn_start" }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "OK" } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "OK" }] } }) + "\\n");
  process.stdout.write(JSON.stringify({ type: "turn_end" }) + "\\n");
  // Stay alive briefly so the cancellation probe can SIGTERM us mid-run.
  setTimeout(() => process.exit(0), 1000);
  return;
}
process.stdout.write("unknown subcommand: " + args[0] + "\\n");
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

function makeCrushFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "repoos-contract-crush-"));
  const bin = join(dir, "crush");
  writeFileSync(bin, FAKE_CRUSH, { mode: 0o755 });
  const fx: Fixture = {
    bin,
    dir,
    log: join(dir, "argv.log"),
    clean: () => rmSync(dir, { recursive: true, force: true }),
  };
  fixtures.push(fx);
  return fx;
}

function makePiFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "repoos-contract-pi-"));
  const bin = join(dir, "pi");
  writeFileSync(bin, FAKE_PI, { mode: 0o755 });
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
    expect(firstRun).toContain("--auto"); // --dir removed in opencode v2; cwd is set via spawn option
    expect(resume).toBeDefined();
    expect(resume).toContain("sess-123"); // the session id the fixture emitted
  });

  it("passes every seam against a deterministic fixture crush binary (two documented skips)", async () => {
    const fx = makeCrushFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    const result = await runAdapterContract({ cli: "crush", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_LOG;

    expect(result.passed).toBe(true);
    expect(result.evidence).toContain("adapter contract suite passed 8/8");
    expect(result.detectedVersion).toEqual([0, 97, 1]);
    const byId = new Map(result.capabilities.map((c) => [c.id, c]));
    for (const cap of result.capabilities) {
      expect(cap.ok, `${cap.id} should pass: ${cap.detail}`).toBe(true);
    }
    // Crush has no structured stream and no session id during a run; both are
    // documented skips rather than failures.
    expect(byId.get("structured-events")?.detail).toMatch(/skipped:/);
    expect(byId.get("session-continuation")?.detail).toMatch(/skipped:/);
    // Auto-approval is a property of the non-interactive mode, not a flag.
    expect(byId.get("auto-permissions")?.detail).toMatch(/accepts no bypass flag/);
    // Cancellation is exercised with SIGINT, not SIGTERM.
    expect(byId.get("cancellation")?.detail).toMatch(/SIGINT stopped the run/);
  });

  it("drives crush's documented invocation shapes (run --quiet, models, --version, --help)", async () => {
    const fx = makeCrushFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    await runAdapterContract({ cli: "crush", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_LOG;

    const argv = readSpawnLog(fx);
    const firstRun = argv.find((args) => args[0] === "run" && !args.includes("--session"));
    expect(firstRun).toBeDefined();
    expect(firstRun).toContain("--quiet");
    expect(firstRun).not.toContain("--continue");
    expect(argv.some((args) => args[0] === "models")).toBe(true);
    expect(argv.some((args) => args[0] === "--version")).toBe(true);
    expect(argv.some((args) => args[0] === "--help")).toBe(true);
    // session-continuation is a documented skip, so the probe never resumes; the
    // real driver's resume shape is asserted in agent-drivers.test.ts.
    expect(argv.some((args) => args[0] === "run" && args.includes("--session"))).toBe(false);
  });

  it("passes every seam against a deterministic fixture pi binary", async () => {
    const fx = makePiFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    const result = await runAdapterContract({ cli: "pi", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_LOG;

    expect(result.passed).toBe(true);
    expect(result.evidence).toContain("adapter contract suite passed 8/8");
    expect(result.detectedVersion).toEqual([0, 99, 2]);
    const byId = new Map(result.capabilities.map((c) => [c.id, c]));
    for (const cap of result.capabilities) {
      expect(cap.ok, `${cap.id} should pass: ${cap.detail}`).toBe(true);
    }
    // pi's JSONL stream is first-class: structured events and session
    // continuation are real probes, not skips.
    expect(byId.get("structured-events")?.ok).toBe(true);
    expect(byId.get("session-continuation")?.ok).toBe(true);
    // Auto-approval is a property of the non-interactive mode, not a flag.
    expect(byId.get("auto-permissions")?.detail).toMatch(/accepts no bypass flag/);
  });

  it("drives pi's documented invocation shapes (--mode json, --list-models, --session)", async () => {
    const fx = makePiFixture();
    process.env.REPOOS_CONTRACT_LOG = fx.log;
    await runAdapterContract({ cli: "pi", bin: fx.bin, mode: "fixture" });
    delete process.env.REPOOS_CONTRACT_LOG;

    const argv = readSpawnLog(fx);
    const firstRun = argv.find((args) => args.includes("--mode") && !args.includes("--session"));
    expect(firstRun).toBeDefined();
    expect(firstRun).toContain("json");
    const resume = argv.find((args) => args.includes("--session"));
    expect(resume).toBeDefined();
    expect(resume).toContain("sess-123");
    expect(argv.some((args) => args.includes("--list-models"))).toBe(true);
    expect(argv.some((args) => args.includes("--version"))).toBe(true);
    expect(argv.some((args) => args.includes("--help"))).toBe(true);
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
    // A synthetic cli name that has no contract templates; the framework must
    // say so rather than crash.
    const result = await runAdapterContract({ cli: "no-such-harness", mode: "fixture" });
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
