import { describe, expect, test } from "bun:test";
import worker, { markdownTwinPath, prefersMarkdown } from "../worker";

describe("Markdown negotiation", () => {
  test("prefers explicit Markdown, including an HTML quality tie", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.8, text/html;q=0.8")).toBe(true);
    expect(prefersMarkdown("text/markdown;q=0.9, text/html;q=1")).toBe(false);
  });

  test("keeps missing, wildcard, and browser Accept headers on HTML", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
    expect(prefersMarkdown("text/html,application/xhtml+xml,*/*;q=0.8")).toBe(false);
  });

  test("maps only clean page routes to existing twin naming", () => {
    expect(markdownTwinPath("/")).toBe("/index.md");
    expect(markdownTwinPath("/getting-started")).toBe("/getting-started.md");
    expect(markdownTwinPath("/getting-started/")).toBe("/getting-started.md");
    expect(markdownTwinPath("/getting-started.md")).toBeNull();
    expect(markdownTwinPath("/llms.txt")).toBeNull();
    expect(markdownTwinPath("/sitemap.xml")).toBeNull();
  });

  test("falls back to HTML when the mapped twin is missing and varies HTML", async () => {
    const env = {
      ASSETS: {
        fetch: async (request: Request) => {
          const url = new URL(request.url);
          if (url.pathname.endsWith(".md")) return new Response("missing", { status: 404 });
          return new Response("<html></html>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        },
      },
    } as never;
    const response = await worker.fetch(
      new Request("https://docs.example/unknown", { headers: { Accept: "text/markdown" } }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(await response.text()).toBe("<html></html>");
  });

  test("serves twins as non-cacheable Markdown with Vary", async () => {
    const env = {
      ASSETS: {
        fetch: async (request: Request) =>
          new URL(request.url).pathname.endsWith(".md")
            ? new Response("# Guide", { headers: { "Content-Type": "text/plain" } })
            : new Response("<html></html>", { headers: { "Content-Type": "text/html" } }),
      },
    } as never;
    const response = await worker.fetch(
      new Request("https://docs.example/getting-started/", {
        headers: { Accept: "text/markdown" },
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("Vary")).toBe("Accept");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("# Guide");
  });
});
