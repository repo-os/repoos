import { describe, expect, it } from "vitest";
import { getConfigSchema } from "../../core/config.js";
import { generalSectionForKey, isGeneralSchemaFieldKey } from "../src/settings-location.js";

describe("Settings — performance controls (#0836)", () => {
  const keys = [
    "localChecks.maxConcurrent",
    "playwright.maxConcurrent",
    "pressureGuard.enabled",
    "remoteValidation.offloadBrowserSteps",
    "remoteValidation.localFallback",
  ];

  it("exposes schema rows for every new performance key", () => {
    const schema = getConfigSchema();
    for (const key of keys) {
      expect(schema.some((f) => f.key === key)).toBe(true);
    }
  });

  it("maps local caps to the Performance section", () => {
    expect(generalSectionForKey("localChecks.maxConcurrent")).toBe("performance");
    expect(generalSectionForKey("playwright.maxConcurrent")).toBe("performance");
    expect(generalSectionForKey("pressureGuard.enabled")).toBe("performance");
    expect(isGeneralSchemaFieldKey("localChecks.maxConcurrent")).toBe(true);
  });
});
