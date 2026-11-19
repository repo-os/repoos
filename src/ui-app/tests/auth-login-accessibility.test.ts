import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isShotPreviewFixtureId } from "../../core/shot-fixtures.js";

const loginView = readFileSync(resolve(__dirname, "../src/views/LoginView.vue"), "utf8");

describe("login form accessibility", () => {
  it.each([
    ["Administrator email", "bootstrapEmail"],
    ["Email address", "email"],
    ["One-time code", "otpCode"],
  ])("gives the %s field an accessible name", (label, model) => {
    const input = loginView.match(new RegExp(`<input\\b(?=[^>]*v-model="${model}")[^>]*>`));
    expect(input?.[0]).toContain(`aria-label="${label}"`);
  });

  it("announces login errors as alerts in bootstrap and sign-in flows", () => {
    expect(loginView.match(/class="login-error" role="alert"/g)).toHaveLength(2);
  });

  it.each(["auth:login", "auth:otp"])("registers the %s handoff fixture", (fixture) => {
    expect(isShotPreviewFixtureId(fixture)).toBe(true);
  });
});
