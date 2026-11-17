import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// #1154 review: the bound port must never overwrite RouteContext.servePort,
// because schedule guards read servePort === 0 as "ephemeral harness, never
// run schedules". Source-level guard so a refactor cannot merge the two again.
describe("route context ports", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "../../server", rel), "utf8");

  it("keeps servePort as the requested port and exposes the bound port separately", () => {
    const server = read("server.ts");
    expect(server).toMatch(/servePort: requestedPort,\s*\n[\s\S]{0,200}get boundPort\(\)/);
    expect(server).not.toMatch(/servePort: boundServePort/);
  });

  it("uses the bound port for restart commands and the requested port for schedule guards", () => {
    const info = read("routes/info.ts");
    expect(info).toContain("ctx.boundPort ?? ctx.servePort");
    expect(read("routes/schedules.ts")).toContain(
      "scheduleHostileReason(ctx.config, process.env, ctx.servePort)",
    );
  });
});
