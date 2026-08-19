/**
 * Resend's `from` field is a bare RFC 5322 address by default, so with no
 * display name mail clients fall back to showing the address's local part
 * (e.g. "otp") as the sender name. buildFromHeader adds an optional name.
 */
import { describe, expect, it } from "vitest";
import { buildFromHeader } from "../../server/routes/auth";

describe("buildFromHeader", () => {
  it("uses 'Name <address>' format when fromName is set", () => {
    expect(
      buildFromHeader({ type: "resend", apiKey: "x", fromAddress: "otp@send.x.com", fromName: "RepoOS" }),
    ).toBe("RepoOS <otp@send.x.com>");
  });

  it("falls back to the bare address when fromName is unset", () => {
    expect(buildFromHeader({ type: "resend", apiKey: "x", fromAddress: "otp@send.x.com" })).toBe(
      "otp@send.x.com",
    );
  });

  it("falls back to the bare address when fromName is an empty string", () => {
    expect(
      buildFromHeader({ type: "resend", apiKey: "x", fromAddress: "otp@send.x.com", fromName: "" }),
    ).toBe("otp@send.x.com");
  });
});
