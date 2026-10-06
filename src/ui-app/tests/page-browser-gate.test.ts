import { describe, expect, it } from "vitest";
import {
  checkHorizontalOverflowAtViewport,
  createPageGateCollector,
  isBenignFailedResourceUrl,
  shouldRecordFailedHttpResponse,
} from "../../core/page-browser-gate.js";
import type { PageGateListenerPage } from "../../core/page-browser-gate.js";

describe("page-browser-gate (#0680)", () => {
  it("flags horizontal overflow at a viewport width", async () => {
    const page = {
      on(): void {},
      async setViewportSize(): Promise<void> {},
      async waitForTimeout(): Promise<void> {},
      async evaluate<T>(fn: () => T): Promise<T> {
        return fn();
      },
    } as unknown as PageGateListenerPage;
    Object.assign(page, {
      evaluate: async () => ({ scrollWidth: 1542, innerWidth: 1024 }),
    });
    const issue = await checkHorizontalOverflowAtViewport(page, 1024, "dashboard");
    expect(issue?.kind).toBe("overflow");
    expect(issue?.message).toContain("1542");
  });

  it("collects console errors", () => {
    const collector = createPageGateCollector();
    const handlers: Record<string, Array<(arg: unknown) => void>> = {
      console: [],
      pageerror: [],
      response: [],
    };
    const page = {
      on(event: string, handler: (arg: unknown) => void) {
        handlers[event]?.push(handler);
      },
      async evaluate<T>(fn: () => T): Promise<T> {
        return fn();
      },
      async setViewportSize(): Promise<void> {},
    } as unknown as PageGateListenerPage;
    collector.attach(page);
    handlers.console[0]?.({
      type: () => "error",
      text: () => "Invalid layer expression",
      location: () => ({ url: "" }),
    });
    expect(collector.drain()[0]?.message).toContain("Invalid layer");
  });

  it("ignores benign failed resource URLs", () => {
    expect(isBenignFailedResourceUrl("http://127.0.0.1:1/favicon.ico")).toBe(true);
    expect(isBenignFailedResourceUrl("http://127.0.0.1:1/app.js")).toBe(false);
    expect(
      shouldRecordFailedHttpResponse("http://127.0.0.1:1/favicon.ico", 404, "http://127.0.0.1:1/"),
    ).toBe(false);
    expect(
      shouldRecordFailedHttpResponse(
        "http://127.0.0.1:1/api/tasks/x/stats",
        404,
        "http://127.0.0.1:1/",
      ),
    ).toBe(false);
    expect(
      shouldRecordFailedHttpResponse("http://127.0.0.1:1/api/broken", 500, "http://127.0.0.1:1/"),
    ).toBe(true);
    expect(
      shouldRecordFailedHttpResponse("https://cdn.example/x.js", 404, "http://127.0.0.1:1/"),
    ).toBe(false);
  });

  it("does not record cross-origin HTTP failures", () => {
    const origin = "http://127.0.0.1:9";
    const collector = createPageGateCollector(origin);
    const handlers: Record<string, Array<(arg: unknown) => void>> = {
      console: [],
      pageerror: [],
      response: [],
    };
    const page = {
      on(event: string, handler: (arg: unknown) => void) {
        handlers[event]?.push(handler);
      },
      async evaluate<T>(fn: () => T): Promise<T> {
        return fn();
      },
      async setViewportSize(): Promise<void> {},
    } as unknown as PageGateListenerPage;
    collector.attach(page);
    handlers.response[0]?.({
      url: () => "http://127.0.0.1:9/favicon.ico",
      status: () => 404,
    });
    handlers.response[0]?.({
      url: () => "http://127.0.0.1:9/settings",
      status: () => 404,
    });
    expect(collector.drain()).toMatchObject([
      { kind: "request", message: expect.stringContaining("404") },
    ]);
  });
});
