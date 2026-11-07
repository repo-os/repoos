import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmdMessage, cmdSendBack, parseMessageInput } from "./control-api.js";
import { RepoOsApi } from "../cli/repoos-api.js";

const dir = mkdtempSync(join(tmpdir(), "repoos-message-input-"));
const file = join(dir, "brief.txt");
writeFileSync(file, " first line\nsecond line \n");
const piped = { isTTY: false, read: () => " first line\nsecond line \n" };
const terminal = {
  isTTY: true,
  read: () => {
    throw new Error("unexpected read");
  },
};
afterEach(() => vi.restoreAllMocks());
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

describe.each([
  ["message", cmdMessage],
  ["send-back", cmdSendBack],
] as const)("%s message input", (_name, command) => {
  it.each([
    [["first", "line"], "first line"],
    [["-"], "first line\nsecond line"],
    [[], "first line\nsecond line"],
    [["--file", file], "first line\nsecond line"],
    [["--message-file", file], "first line\nsecond line"],
    [["--message", "first line"], "first line"],
    [["--message-file", "-"], "first line\nsecond line"],
  ])("accepts %j", async (args, expected) => {
    vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "requestOk").mockResolvedValue({});
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await command(["123", ...args], piped)).toBe(0);
    expect(request).toHaveBeenCalledWith(
      "POST",
      expect.any(String),
      expect.objectContaining(_name === "message" ? { text: expected } : { message: expected }),
    );
  });

  it.each([
    ["text", "--file", file],
    ["-"],
    ["--unknown"],
    ["--message", "  "],
    ["--file", join(dir, "missing")],
    ["--message"],
    ["--message", "x", "extra"],
  ])("rejects %j before the API", async (...args) => {
    expect(() => parseMessageInput(["123", ...args], terminal)).toThrow();
    const health = vi.spyOn(RepoOsApi.prototype, "health");
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await command(["123", ...args], terminal)).toBe(1);
    expect(health).not.toHaveBeenCalled();
  });

  it("reports the text length and first line", async () => {
    vi.spyOn(RepoOsApi.prototype, "health").mockResolvedValue(true);
    const request = vi.spyOn(RepoOsApi.prototype, "requestOk").mockResolvedValue({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await command(["123", "--message", "hello\nworld"])).toBe(0);
    expect(request).toHaveBeenCalledWith(
      "POST",
      expect.any(String),
      expect.objectContaining(
        _name === "message" ? { text: "hello\nworld" } : { message: "hello\nworld" },
      ),
    );
    expect(log.mock.calls.flat().join(" ")).toContain("11 characters: hello");
  });
});
