import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepoOS } from "../../core/repoos";
import {
  appendScreenshotsSection,
  MAX_SCREENSHOT_BYTES,
  resolveScreenshot,
  sanitizeName,
  saveScreenshot,
} from "../../server/attachments";

/** A 1x1 transparent PNG, base64-encoded. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const META = {
  id: "1",
  name: "bug.png",
  path: "work/.attachments/0001/screenshot-1.png",
  url: "/api/tasks/0001/attachments/screenshot-1.png",
  size: 1,
  mime: "image/png",
};

describe("appendScreenshotsSection", () => {
  it("keeps the Screenshots section before the append-only Activity section", () => {
    const body = [
      "## Problem",
      "",
      "No screenshots today.",
      "",
      "## Activity",
      "",
      "- 2026-08-01T00:00:00Z · created · unknown",
    ].join("\n");
    const out = appendScreenshotsSection(body, [META]);
    const screenshotsIdx = out.indexOf("## Screenshots");
    const activityIdx = out.indexOf("## Activity");
    expect(screenshotsIdx).toBeGreaterThan(-1);
    expect(screenshotsIdx).toBeLessThan(activityIdx);
    expect(out).toContain("![bug.png](/api/tasks/0001/attachments/screenshot-1.png)");
    expect(out.trimEnd().endsWith("- 2026-08-01T00:00:00Z · created · unknown")).toBe(true);
  });

  it("appends the section when the body has no Activity section", () => {
    const out = appendScreenshotsSection("## Problem\n\nSomething.\n", [META]);
    expect(out).toContain("## Screenshots");
    expect(out).toContain("![bug.png](/api/tasks/0001/attachments/screenshot-1.png)");
    expect(out.trimEnd().endsWith("![bug.png](/api/tasks/0001/attachments/screenshot-1.png)")).toBe(
      true,
    );
  });
});

describe("saveScreenshot", () => {
  it("writes the image file and returns its metadata", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "screenshot me" });
      const result = saveScreenshot(repoos.config, task, {
        name: "../evil/../shot.png",
        mime: "image/png",
        data: PNG_1PX,
      });
      expect("error" in result).toBe(false);
      const meta = result as typeof META;
      expect(meta.id).toBe("1");
      expect(meta.name).toBe("shot");
      expect(meta.path).toBe(`work/.attachments/${task.id}/screenshot-1.png`);
      expect(meta.url).toBe(`/api/tasks/${task.id}/attachments/screenshot-1.png`);
      const abs = resolveScreenshot(repoos.config, task.id, "screenshot-1.png");
      expect(abs).not.toBeNull();
      expect(readFileSync(abs!, "utf8")).toBe(Buffer.from(PNG_1PX, "base64").toString());
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("numbers multiple screenshots sequentially", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "two shots" });
      saveScreenshot(repoos.config, task, { name: "a.png", mime: "image/png", data: PNG_1PX });
      const second = saveScreenshot(repoos.config, task, {
        name: "b.png",
        mime: "image/png",
        data: PNG_1PX,
      });
      expect("error" in second).toBe(false);
      expect((second as typeof META).id).toBe("2");
      expect((second as typeof META).path).toBe(`work/.attachments/${task.id}/screenshot-2.png`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects unsupported mime types", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "svg?" });
      const result = saveScreenshot(repoos.config, task, {
        name: "x.svg",
        mime: "image/svg+xml",
        data: "PHN2Zz4=",
      });
      expect("error" in result).toBe(true);
      expect((result as { error: string }).error).toContain("Unsupported image type");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects missing, empty, or invalid image data", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "empty" });
      expect("error" in saveScreenshot(repoos.config, task, { name: "a", mime: "image/png" })).toBe(
        true,
      );
      expect(
        "error" in saveScreenshot(repoos.config, task, { name: "a", mime: "image/png", data: "" }),
      ).toBe(true);
      expect(
        "error" in
          saveScreenshot(repoos.config, task, { name: "a", mime: "image/png", data: "%%%" }),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects oversize images", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "big" });
      const big = Buffer.alloc(MAX_SCREENSHOT_BYTES + 1).toString("base64");
      const result = saveScreenshot(repoos.config, task, {
        name: "big.png",
        mime: "image/png",
        data: big,
      });
      expect("error" in result).toBe(true);
      expect((result as { error: string }).error).toContain("too large");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("resolveScreenshot", () => {
  it("refuses path traversal and misses", () => {
    const root = mkdtempSync(join(tmpdir(), "repoos-shot-"));
    try {
      const repoos = createRepoOS(root);
      const task = repoos.createTask({ title: "traversal" });
      expect(resolveScreenshot(repoos.config, task.id, "..%2F..%2Frepoos.toml")).toBeNull();
      expect(resolveScreenshot(repoos.config, task.id, "../../repoos.toml")).toBeNull();
      expect(resolveScreenshot(repoos.config, task.id, "missing.png")).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("sanitizeName", () => {
  it("strips directories and hostile characters", () => {
    expect(sanitizeName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeName("my shot(1).png")).toBe("my-shot-1");
  });
});
