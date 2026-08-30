/**
 * Resend's `from` field is a bare RFC 5322 address by default, so with no
 * display name mail clients fall back to showing the address's local part
 * (e.g. "otp") as the sender name. buildFromHeader always supplies a name —
 * either the configured override, or the standardized "RepoOS at <repo>"
 * default (matching the ntfy test-notification convention).
 */
import { describe, expect, it } from "vitest";
import type { RepoOSConfig } from "../../core/types";
import { buildFromHeader } from "../../server/routes/auth";

function config(root: string): RepoOSConfig {
  return {
    root,
    workDir: "work",
    docsDir: "docs",
    skillsDir: "skills",
    taskExtensions: [".md"],
    defaultStatus: "inbox",
    defaultAssignee: "unassigned",
    cacheDir: ".repoos",
  };
}

describe("buildFromHeader", () => {
  it("uses the configured fromName when set", () => {
    expect(
      buildFromHeader(config("/repos/JagoCoffee"), {
        type: "resend",
        apiKey: "x",
        fromAddress: "otp@send.x.com",
        fromName: "Custom Name",
      }),
    ).toBe("Custom Name <otp@send.x.com>");
  });

  it("falls back to 'RepoOS at <repo>' when fromName is unset", () => {
    expect(
      buildFromHeader(config("/repos/JagoCoffee"), {
        type: "resend",
        apiKey: "x",
        fromAddress: "otp@send.x.com",
      }),
    ).toBe("RepoOS at JagoCoffee <otp@send.x.com>");
  });

  it("falls back to the default when fromName is an empty string", () => {
    expect(
      buildFromHeader(config("/repos/Celleris"), {
        type: "resend",
        apiKey: "x",
        fromAddress: "otp@send.x.com",
        fromName: "",
      }),
    ).toBe("RepoOS at Celleris <otp@send.x.com>");
  });
});
