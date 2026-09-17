/**
 * PM message screenshot context (#0382): when the PM tab uploads one or more
 * screenshots and then sends a message, the server embeds their URLs and
 * repo-relative paths into the PM's task context. This test pins down the
 * fragment the route produces so the PM can reference or link them in the
 * spec when relevant.
 */
import { describe, expect, it } from "vitest";
import { buildPmShotContext } from "../../server/routes/tasks";

describe("buildPmShotContext (#0382)", () => {
  it("returns an empty string for no screenshots", () => {
    expect(buildPmShotContext([])).toBe("");
  });

  it("renders each screenshot as a url= and repo-path= line", () => {
    const out = buildPmShotContext([
      {
        url: "/api/tasks/0382/attachments/screenshot-1.png",
        path: "work/.attachments/0382/screenshot-1.png",
        name: "bug.png",
      },
    ]);
    expect(out).toContain("Newly attached screenshots");
    expect(out).toContain("url=/api/tasks/0382/attachments/screenshot-1.png");
    expect(out).toContain("repo-path=work/.attachments/0382/screenshot-1.png");
    // The header is on its own line.
    expect(out.split("\n")[0]).toBe("");
    expect(out.split("\n")[1]).toMatch(/^Newly attached screenshots/);
  });

  it("supports multiple screenshots, one per line", () => {
    const out = buildPmShotContext([
      {
        url: "/api/tasks/0382/attachments/screenshot-1.png",
        path: "work/.attachments/0382/screenshot-1.png",
      },
      {
        url: "/api/tasks/0382/attachments/screenshot-2.png",
        path: "work/.attachments/0382/screenshot-2.png",
      },
    ]);
    expect(out).toContain("screenshot-1.png");
    expect(out).toContain("screenshot-2.png");
    const lines = out.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(2);
  });

  it("skips malformed entries and entries with no url AND no path", () => {
    const out = buildPmShotContext([
      null,
      undefined,
      0,
      "string",
      {},
      { name: "no-url-or-path.png" },
      { url: "   ", path: "   " },
      { url: "/api/tasks/0382/attachments/screenshot-1.png" },
    ]);
    expect(out).toContain("screenshot-1.png");
    expect(out.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(1);
  });

  it("survives a url-only or path-only entry (one of them is enough)", () => {
    const urlOnly = buildPmShotContext([{ url: "/api/x.png" }]);
    expect(urlOnly).toContain("url=/api/x.png");
    expect(urlOnly).not.toContain("repo-path=");

    const pathOnly = buildPmShotContext([{ path: "work/.attachments/0382/x.png" }]);
    expect(pathOnly).toContain("repo-path=work/.attachments/0382/x.png");
    expect(pathOnly).not.toContain("url=");
  });

  it("trims surrounding whitespace from url/path strings", () => {
    const out = buildPmShotContext([
      { url: "  /api/x.png  ", path: "  work/.attachments/x.png  " },
    ]);
    expect(out).toContain("url=/api/x.png");
    expect(out).toContain("repo-path=work/.attachments/x.png");
    expect(out).not.toMatch(/url=\s/);
  });
});
