// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import landingWorker, { agentRedirect } from "../../../landing/worker.js";
import docsWorker, { docsRedirect } from "../../../user-docs/worker.js";

const assetEnv = () => ({ ASSETS: { fetch: vi.fn(async () => new Response("asset")) } });

describe("guessable agent URLs on repoos.org", () => {
  it.each(["/llms-full.txt", "/AGENTS.md", "/.well-known/llms.txt", "/docs"])(
    "redirects %s instead of 404ing",
    async (path) => {
      const env = assetEnv();
      const response = await landingWorker.fetch(
        new Request(`https://repoos.org${path}`),
        env as never,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).not.toBeNull();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );

  it("points llms-full.txt at the docs site and AGENTS.md at the repository file", () => {
    expect(agentRedirect("/llms-full.txt")).toBe("https://docs.repoos.org/llms-full.txt");
    expect(agentRedirect("/.well-known/llms.txt")).toBe("/llms.txt");
    expect(agentRedirect("/AGENTS.md")).toContain("raw.githubusercontent.com/repo-os/repoos");
    expect(agentRedirect("/docs")).toBe("https://docs.repoos.org/");
    expect(agentRedirect("/llms.txt")).toBeNull();
  });
});

describe("guessable agent URLs on docs.repoos.org", () => {
  it.each(["/AGENTS.md", "/.well-known/llms.txt", "/docs"])(
    "redirects %s instead of 404ing",
    async (path) => {
      const env = assetEnv();
      const response = await docsWorker.fetch(
        new Request(`https://docs.repoos.org${path}`),
        env as never,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).not.toBeNull();
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    },
  );

  it("keeps the real llms-full.txt on the docs site", () => {
    expect(docsRedirect("/llms-full.txt")).toBeNull();
    expect(docsRedirect("/docs")).toBe("/");
  });
});
