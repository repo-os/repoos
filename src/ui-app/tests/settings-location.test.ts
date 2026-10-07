import { describe, expect, it } from "vitest";
import { resolveSettingLocation, isGeneralSchemaFieldKey } from "../src/settings-location";
import type { ConfigField } from "../src/types";

function field(over: Partial<ConfigField> & { key: string }): ConfigField {
  return {
    label: over.key,
    type: "string",
    tier: "live",
    restartRequired: false,
    default: "",
    description: "",
    ...over,
  } as ConfigField;
}

describe("resolveSettingLocation", () => {
  const ctx = { inspectorAvailable: true };

  it("maps rendered general, notification, security, and advanced keys", () => {
    expect(resolveSettingLocation("tunnelEnabled", field({ key: "tunnelEnabled" }), ctx)).toEqual({
      tab: "general",
      hasUiRow: true,
    });
    expect(
      resolveSettingLocation(
        "remoteValidation.enabled",
        field({ key: "remoteValidation.enabled" }),
        ctx,
      ),
    ).toEqual({ tab: "general", hasUiRow: true });
    expect(resolveSettingLocation("ntfyTopic", field({ key: "ntfyTopic" }), ctx)).toEqual({
      tab: "notifications",
      hasUiRow: true,
    });
    expect(
      resolveSettingLocation(
        "attention.spendAlertUsd",
        field({ key: "attention.spendAlertUsd", type: "number" }),
        ctx,
      ),
    ).toEqual({ tab: "notifications", hasUiRow: true });
    expect(isGeneralSchemaFieldKey("attention.spendAlertUsd")).toBe(false);
    expect(
      resolveSettingLocation(
        "attention.slowRunMultiplier",
        field({ key: "attention.slowRunMultiplier", type: "number" }),
        ctx,
      ),
    ).toEqual({ tab: "general", hasUiRow: true });
    expect(resolveSettingLocation("auth.enabled", field({ key: "auth.enabled" }), ctx)).toEqual({
      tab: "security",
      hasUiRow: true,
    });
    expect(
      resolveSettingLocation(
        "whisper.provider",
        field({ key: "whisper.provider", group: "voice" }),
        ctx,
      ),
    ).toEqual({ tab: "security", hasUiRow: true });
    expect(
      resolveSettingLocation("board.columns.ready", field({ key: "board.columns.ready" }), ctx),
    ).toEqual({ tab: "advanced", hasUiRow: true });
  });

  it("routes schema-only remote validation keys to repoos.toml", () => {
    const loc = resolveSettingLocation(
      "remoteValidation.tailscaleHost",
      field({ key: "remoteValidation.tailscaleHost" }),
      ctx,
    );
    expect(loc).toEqual({ tab: "toml", hasUiRow: false });
  });

  it("returns null for unknown keys not in the schema", () => {
    expect(resolveSettingLocation("bogus-key", undefined, ctx)).toBeNull();
    expect(resolveSettingLocation("remoteValidation.notInSchema", undefined, ctx)).toBeNull();
  });

  // #0573 — the close-out budget must render as a real Settings control, not
  // fall through to the raw repoos.toml editor.
  it("gives closeOut.timeoutMs a rendered General row", () => {
    expect(
      resolveSettingLocation(
        "closeOut.timeoutMs",
        field({ key: "closeOut.timeoutMs", type: "select" }),
        ctx,
      ),
    ).toEqual({ tab: "general", hasUiRow: true });
    expect(isGeneralSchemaFieldKey("closeOut.timeoutMs")).toBe(true);
  });

  // #0655 — the flake-triage re-run count is a user-facing setting and must
  // render as a real Advanced control, not fall through to the raw TOML editor.
  it("routes the check isolation re-run count to Advanced", () => {
    expect(
      resolveSettingLocation(
        "check.isolationRuns",
        field({ key: "check.isolationRuns", type: "number", tier: "guarded" }),
        ctx,
      ),
    ).toEqual({ tab: "advanced", hasUiRow: true });
  });

  it("mirrors generalFields exclusions via isGeneralSchemaFieldKey", () => {
    expect(isGeneralSchemaFieldKey("maxActiveTasks")).toBe(true);
    expect(isGeneralSchemaFieldKey("remoteValidation.tailscaleHost")).toBe(false);
    expect(isGeneralSchemaFieldKey("auth.enabled")).toBe(false);
  });
});
