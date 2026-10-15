import { describe, expect, it } from "vitest";
import { getConfigSchema } from "../../core/config.js";
import {
  GENERAL_SECTIONS,
  generalSectionForKey,
  generalSectionLabel,
  isGeneralSectionId,
  isGeneralSchemaFieldKey,
} from "../src/settings-location";
import { searchSettings } from "../src/search";
import type { ConfigField } from "../src/types";

const schema = getConfigSchema() as unknown as ConfigField[];
const location = { inspectorAvailable: true };

describe("General settings sections (#0800)", () => {
  it("gives every section a unique, stable id", () => {
    const ids = GENERAL_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("model-routing");
    expect(ids).toContain("general");
  });

  it("resolves a section URL parameter to a real section", () => {
    expect(isGeneralSectionId("model-routing")).toBe(true);
    expect(isGeneralSectionId("publishing")).toBe(true);
    expect(isGeneralSectionId("not-a-section")).toBe(false);
    expect(generalSectionLabel("model-routing")).toBe("Model routing");
  });

  it("maps every rendered General key to a listed section", () => {
    const ids = new Set(GENERAL_SECTIONS.map((s) => s.id));
    const generalKeys = schema.filter(
      (f) => f.tier !== "guarded" && f.group !== "voice" && isGeneralSchemaFieldKey(f.key),
    );
    expect(generalKeys.length).toBeGreaterThan(0);
    for (const f of generalKeys) {
      expect(ids.has(generalSectionForKey(f.key))).toBe(true);
    }
  });

  it("maps the model-routing keys to their own section", () => {
    expect(generalSectionForKey("model_routing.mode")).toBe("model-routing");
    expect(generalSectionForKey("model_routing.provider")).toBe("model-routing");
    expect(generalSectionForKey("model_routing.baseUrl")).toBe("model-routing");
  });

  it("maps hand-rendered General keys to the card they render under", () => {
    expect(generalSectionForKey("activityAnimationStyle")).toBe("activity-animation");
    expect(generalSectionForKey("storage.provider")).toBe("attachments");
    expect(generalSectionForKey("tunnelEnabled")).toBe("publishing");
    expect(generalSectionForKey("remoteValidation.enabled")).toBe("remote-validation");
  });

  it("falls back to the General section for an unmapped key", () => {
    expect(generalSectionForKey("maxActiveTasks")).toBe("general");
    expect(generalSectionForKey("totally-unknown-key")).toBe("general");
  });
});

describe("settings search links to a section (#0800)", () => {
  const searchable = schema.filter((f) => f.tier !== "guarded");

  it("carries the owning section on a result and names it in the subtitle", () => {
    const hits = searchSettings("routing mode", { fields: searchable, location });
    const row = hits.find((r) => r.kind === "setting" && r.key === "model_routing.mode");
    expect(row).toBeTruthy();
    expect(row && row.kind === "setting" && row.section).toBe("model-routing");
    expect(row && row.kind === "setting" && row.subtitle).toContain("Model routing");
  });

  it("finds a section by name", () => {
    // "automation" does not appear in any automation-prefixed setting's own
    // label/description/key; it only matches through the section name.
    const hits = searchSettings("automation", { fields: searchable, location });
    expect(hits.some((r) => r.kind === "setting" && r.section === "automation")).toBe(true);
  });

  it("leaves toml-only keys without a section", () => {
    const hits = searchSettings("capture targets", { fields: searchable, location });
    const row = hits.find((r) => r.kind === "setting" && r.key === "shot.targets");
    expect(row).toBeTruthy();
    expect(row && row.kind === "setting" && row.section).toBeUndefined();
    expect(row && row.kind === "setting" && row.tomlOnly).toBe(true);
  });
});
