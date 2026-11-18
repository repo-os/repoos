import { describe, expect, it } from "vitest";
import { arrayFieldValueForForm } from "../src/settings-form.js";

describe("Settings array field form values", () => {
  it.each([
    { key: "uiVerification.viewportWidths", value: [1024, 375], expected: "1024, 375" },
    {
      key: "remoteValidation.tailscaleHosts",
      value: [{ host: "runner.example" }],
      expected: "runner.example",
    },
    { key: "areas", value: ["web", "core"], expected: "web, core" },
  ])("round-trips $key into its text control", ({ key, value, expected }) => {
    expect(arrayFieldValueForForm(key, value)).toBe(expected);
  });
});
