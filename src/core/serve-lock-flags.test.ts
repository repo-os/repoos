import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  buildHandRunServeArgv,
  captureServeLockFlags,
  compiledCliEntry,
  extractServeFlagsFromCommand,
} from "./serve-lock-flags.js";

describe("captureServeLockFlags", () => {
  it("records restart-relevant flags only", () => {
    expect(
      captureServeLockFlags([
        "serve",
        "--port",
        "7200",
        "--host",
        "127.0.0.1",
        "--quiet",
        "--no-tailscale-https",
        "--preview-overrides",
      ]),
    ).toEqual(["--quiet", "--no-tailscale-https", "--preview-overrides"]);
  });
});

describe("extractServeFlagsFromCommand", () => {
  it("reads flags from a ps command line", () => {
    expect(
      extractServeFlagsFromCommand(
        "/usr/bin/bun dist/cli/index.js serve --port 7200 --host 127.0.0.1 --preview-overrides --quiet",
      ),
    ).toEqual(["--preview-overrides", "--quiet"]);
  });
});

describe("compiledCliEntry", () => {
  it("resolves to dist/cli/index.js from dist/core", () => {
    const entry = compiledCliEntry();
    expect(entry.endsWith("/cli/index.js") || entry.endsWith("\\cli\\index.js")).toBe(true);
    expect(existsSync(entry)).toBe(true);
  });
});

describe("buildHandRunServeArgv", () => {
  it("replays stored flags without adding --quiet by default", () => {
    expect(buildHandRunServeArgv(7200, "127.0.0.1", ["--preview-overrides"])).toEqual([
      "serve",
      "--port",
      "7200",
      "--host",
      "127.0.0.1",
      "--preview-overrides",
    ]);
  });
});
