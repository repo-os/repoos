/**
 * Server-backed CLI commands (#0723).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer, type ServerHandle } from "../../server/server";
import { getAuthStore, resetAuthStoreInstance } from "../../core/auth-store";
import { writeLocalCliToken } from "../../server/local-token";
import { clearCliSession } from "../../cli/cli-session";
import { RepoOsApi } from "../../cli/repoos-api";
import { cmdStats, controlApiServerDownMessage } from "../../commands/control-api";

const tmpRoots: string[] = [];

function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "repoos-cli-api-"));
  tmpRoots.push(dir);
  return dir;
}

async function withServer(
  root: string,
  fn: (s: ServerHandle) => Promise<void>,
  opts: { auth?: boolean } = {},
): Promise<void> {
  if (opts.auth) {
    writeFileSync(
      join(root, "repoos.toml"),
      `[auth]
enabled = true
bootstrapAdmin = "hello@repoos.org"

[auth.emailProvider]
type = "resend"
apiKey = "re_test"
fromAddress = "noreply@repoos.org"
`,
      "utf8",
    );
    const store = getAuthStore(root)!;
    store.upsertUser("hello@repoos.org", "admin", null);
  } else {
    mkdirSync(join(root, "work"), { recursive: true });
  }
  const server = await startServer({ root, host: "127.0.0.1", port: 0 });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

afterEach(() => {
  resetAuthStoreInstance();
  vi.unstubAllEnvs();
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
  tmpRoots.length = 0;
});

describe("control API CLI", () => {
  it("reports a clear error when the server is down", async () => {
    const msg = await controlApiServerDownMessage(59999);
    expect(msg).toMatch(/Can't reach the RepoOS server/);
  });

  it("stats --json hits /api/stats/board", async () => {
    const root = tmpDir();
    await withServer(root, async (s) => {
      const port = Number(new URL(s.url).port);
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const code = await cmdStats(["--json", "--port", String(port)]);
      expect(code).toBe(0);
      const printed = JSON.parse(log.mock.calls[0][0] as string);
      expect(printed).toHaveProperty("ok", true);
      log.mockRestore();
    });
  });

  it("re-authenticates on 401 via dev backdoor without printing the code", async () => {
    const root = tmpDir();
    vi.stubEnv("REPOOS_AUTH_DEV_BACKDOOR_CODE", "test-backdoor-secret");
    vi.stubEnv("NODE_ENV", "development");
    await withServer(root, async (s) => {
      const port = Number(new URL(s.url).port);
      writeLocalCliToken(root, ".repoos");
      const bad = writeLocalCliToken(root, ".repoos");
      expect(bad).toBeTruthy();
      writeFileSync(join(root, ".repoos", "local-cli-token"), "deadbeef\n", { mode: 0o600 });
      clearCliSession(root, ".repoos");
      const log = vi.spyOn(console, "log").mockImplementation(() => {});
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      const code = await cmdStats(["--json", "--port", String(port)]);
      expect(code).toBe(0);
      const output = log.mock.calls.map((c) => c[0]).join("\n");
      expect(output).not.toContain("test-backdoor-secret");
      err.mockRestore();
      log.mockRestore();
    });
  });

});
