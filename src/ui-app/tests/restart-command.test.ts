import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  boardRoot: vi.fn(() => ({ root: "/board/root" })),
  loadConfig: vi.fn(() => ({ cacheDir: "/worktree/.repoos" })),
  restartRepoServer: vi.fn(async () => ({ ok: true, path: "hand-run" as const })),
  locateRepoServer: vi.fn(async () => ({ port: 7171 })),
  readLocalCliToken: vi.fn(() => "local-secret"),
}));

vi.mock("../../core/config.js", () => ({
  boardRoot: mocks.boardRoot,
  loadConfig: mocks.loadConfig,
}));
vi.mock("../../core/server-restart.js", () => ({ restartRepoServer: mocks.restartRepoServer }));
vi.mock("../../core/server-locate.js", () => ({ locateRepoServer: mocks.locateRepoServer }));
vi.mock("../../server/local-token.js", () => ({ readLocalCliToken: mocks.readLocalCliToken }));

import { cmdRestart } from "../../commands/restart.js";

describe("repoos restart CLI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = 0;
  });

  it("uses the requested root and authenticates its idle check with the local token", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ activeWork: { agents: 0, checks: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await cmdRestart(["--root", "/linked/worktree"]);
      expect(mocks.loadConfig).toHaveBeenCalledWith("/linked/worktree");
      expect(mocks.readLocalCliToken).toHaveBeenCalledWith("/linked/worktree", "/worktree/.repoos");
      expect(mocks.locateRepoServer).toHaveBeenCalledWith("/linked/worktree", {
        portFilter: undefined,
      });
      expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:7171/api/update-status", {
        headers: { "x-repoos-local-token": "local-secret" },
      });
      expect(mocks.restartRepoServer).toHaveBeenCalledWith(
        "/linked/worktree",
        expect.objectContaining({ portFilter: undefined }),
      );
      expect(process.exitCode).toBe(0);
    } finally {
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
