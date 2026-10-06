import { describe, expect, it } from "vitest";
import {
  checkHorizontalOverflowAtViewport,
  createPageGateCollector,
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
});
