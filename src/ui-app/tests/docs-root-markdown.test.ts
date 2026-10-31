// @vitest-environment node
import { describe, expect, it } from "vitest";
import worker from "../../../user-docs/worker.js";

describe("docs root Markdown negotiation", () => {
  function env() {
    return {
      ASSETS: {
        fetch: async (request: Request) => {
          const path = new URL(request.url).pathname;
          if (path === "/llms.txt") return new Response("# Docs index");
          if (path === "/getting-started.md") return new Response("# Guide");
          if (path.endsWith(".md")) return new Response("missing", { status: 404 });
          return new Response("<html></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    };
  }

  it("serves llms.txt at / when Accept prefers Markdown", async () => {
    const response = await worker.fetch(
      new Request("https://docs.example/", { headers: { Accept: "text/markdown" } }),
      env(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(await response.text()).toBe("# Docs index");
  });

  it("keeps / as HTML without the Accept header and leaves /llms.txt alone", async () => {
    const html = await worker.fetch(new Request("https://docs.example/"), env());
    expect(html.headers.get("Content-Type")).toContain("text/html");
    expect(await html.text()).toBe("<html></html>");

    const direct = await worker.fetch(
      new Request("https://docs.example/llms.txt", { headers: { Accept: "text/markdown" } }),
      env(),
    );
    expect(direct.headers.get("Content-Type") ?? "").not.toContain("text/markdown");
    expect(await direct.text()).toBe("# Docs index");
  });
});
