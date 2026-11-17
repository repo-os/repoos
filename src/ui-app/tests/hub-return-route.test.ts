/**
 * The native Hub return-to-picker landing route (#1152). The shell watches
 * this exact path in its WebView navigation event, so the page must load
 * without auth, boot the SPA, or run scripts.
 */
import { describe, expect, it, vi } from "vitest";
import type { ServerResponse } from "node:http";
import { serveHubReturn } from "../../server/routes/ui.js";
import { HUB_RETURN_PATH } from "../../core/hub-return.js";

function fakeResponse() {
  const writeHead = vi.fn();
  const end = vi.fn();
  const res = { writeHead, end } as unknown as ServerResponse;
  return { res, writeHead, end };
}

describe("hub return route", () => {
  it("serves a no-store, script-free landing page at the agreed path", () => {
    const { res, writeHead, end } = fakeResponse();
    serveHubReturn({} as never, {} as never, res, {} as never);

    expect(HUB_RETURN_PATH).toBe("/__repoos_hub/return-to-picker");
    expect(writeHead).toHaveBeenCalledOnce();
    const [status, headers] = writeHead.mock.calls[0] as [number, Record<string, string>];
    expect(status).toBe(200);
    expect(headers["Content-Type"]).toContain("text/html");
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'none'");

    const body = end.mock.calls[0]?.[0] as string;
    expect(body).toContain("Returning to RepoOS Hub");
    expect(body).not.toContain("<script");
  });
});
