import { afterEach, describe, expect, it, vi } from "vitest";
import { copyToClipboard } from "../src/lib/clipboard";

const origClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const origExec = Object.getOwnPropertyDescriptor(Document.prototype, "execCommand");

afterEach(() => {
  if (origClipboard) Object.defineProperty(navigator, "clipboard", origClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
  if (origExec) Object.defineProperty(Document.prototype, "execCommand", origExec);
  else delete (document as { execCommand?: unknown }).execCommand;
  vi.restoreAllMocks();
});

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, "clipboard", { value, configurable: true });
}

// jsdom 30 does not implement document.execCommand — install a stub the tests control.
function setExecCommand(fn: (cmd: string) => boolean): ReturnType<typeof vi.fn> {
  const spy = vi.fn(fn);
  Object.defineProperty(document, "execCommand", {
    value: spy,
    configurable: true,
    writable: true,
  });
  return spy;
}

describe("copyToClipboard", () => {
  it("uses navigator.clipboard when available (secure context)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const exec = setExecCommand(() => true);

    expect(await copyToClipboard("hello")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when navigator.clipboard is undefined (plain-HTTP LAN / Tailscale)", async () => {
    setClipboard(undefined);
    const exec = setExecCommand(() => true);

    expect(await copyToClipboard("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("falls back to execCommand when the async clipboard call rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });
    const exec = setExecCommand(() => true);

    expect(await copyToClipboard("hello")).toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns false when both paths fail", async () => {
    setClipboard(undefined);
    setExecCommand(() => false);

    expect(await copyToClipboard("hello")).toBe(false);
  });
});
