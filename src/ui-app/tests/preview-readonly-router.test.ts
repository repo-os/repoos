import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { RouteContext } from "../../server/routes/types.js";
import { Router } from "../../server/routes/router.js";

describe("preview child API is read-only", () => {
  it("rejects mutating routes before their handlers run", async () => {
    const oldPreview = process.env.REPOOS_PREVIEW_CHILD;
    process.env.REPOOS_PREVIEW_CHILD = "1";
    try {
      const router = new Router();
      let called = false;
      router.register("PATCH", "/api/tasks/0950", () => {
        called = true;
      });
      const response = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        body: "",
        setHeader(name: string, value: string) {
          this.headers[name] = value;
        },
        end(body: string) {
          this.body = body;
        },
      };

      const handled = await router.dispatch(
        {} as RouteContext,
        "PATCH",
        "/api/tasks/0950",
        {} as IncomingMessage,
        response as unknown as ServerResponse,
      );

      expect(handled).toBe(true);
      expect(response.statusCode).toBe(405);
      expect(JSON.parse(response.body)).toEqual({ error: "preview servers are read-only" });
      expect(called).toBe(false);
    } finally {
      if (oldPreview === undefined) delete process.env.REPOOS_PREVIEW_CHILD;
      else process.env.REPOOS_PREVIEW_CHILD = oldPreview;
    }
  });
});
