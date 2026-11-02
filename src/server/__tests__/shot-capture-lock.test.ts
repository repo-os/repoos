import { afterEach, describe, expect, it } from "vitest";
import {
  releaseBrowserCapture,
  reserveBrowserCapture,
  waitForBrowserCapture,
} from "../shot-capture.js";

const taskId = "shot-capture-lock-test";

afterEach(() => releaseBrowserCapture(taskId));

describe("browser capture coordination", () => {
  it("waits for an in-flight capture to release before retrying", async () => {
    expect(reserveBrowserCapture(taskId)).toBe(true);
    const waiting = waitForBrowserCapture(taskId);
    expect(reserveBrowserCapture(taskId)).toBe(false);

    releaseBrowserCapture(taskId);

    await expect(waiting).resolves.toBe(true);
    expect(reserveBrowserCapture(taskId)).toBe(true);
  });

  it("reports a bounded wait when a capture never releases", async () => {
    expect(reserveBrowserCapture(taskId)).toBe(true);
    await expect(waitForBrowserCapture(taskId, 1)).resolves.toBe(false);
  });
});
