import { describe, expect, it } from "vitest";
import {
  formatRemotePoolQueueMessage,
  parseRemotePoolQueueMessage,
} from "../../core/remote-pool-queue.js";
import { remotePoolQueueHint } from "../src/lib/remote-pool-queue.js";

describe("remote pool queue copy (#0706)", () => {
  it("formats and parses the Tailscale pool queue line", () => {
    const line = formatRemotePoolQueueMessage(
      { host: "linux2", ahead: 2, position: 3 },
      ["linux"],
    );
    expect(line).toContain("waiting for a runner on linux2 (queue position 3)");
    expect(line).toContain("queued behind 2 other remote run(s)");
    expect(line).toContain("waiting for a host with linux");
    const parsed = parseRemotePoolQueueMessage(line);
    expect(parsed).toEqual({ host: "linux2", ahead: 2, position: 3 });
  });

  it("builds UI hint copy from buffered output", () => {
    const line = formatRemotePoolQueueMessage({ host: "bee", ahead: 0, position: 1 }, []);
    const hint = remotePoolQueueHint(`prefix\n${line}suffix`);
    expect(hint?.label).toBe("waiting for runner on bee (position 1)");
    expect(hint?.title).toMatch(/queued on bee/i);
  });
});
