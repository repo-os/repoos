import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitRollback } from "../scripts/migration-split.js";
import { telegramUsernameSuffixFromRequestId } from "../src/crypto.js";

describe("splitRollback", () => {
  it("0001_init.sql forward includes provisioning DDL, not header comments only", () => {
    const sql = readFileSync(
      join(import.meta.dirname, "..", "migrations", "0001_init.sql"),
      "utf8",
    );
    const { forward, rollback } = splitRollback(sql);
    expect(forward).toContain("CREATE TABLE IF NOT EXISTS provisioning_requests");
    expect(forward).toMatch(/^[\s\S]*CREATE TABLE IF NOT EXISTS provisioning_requests/m);
    const executableLines = forward
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("--"));
    expect(executableLines.some((l) => l.startsWith("CREATE TABLE"))).toBe(true);
    expect(rollback).toContain("DROP TABLE IF EXISTS provisioning_requests");
    expect(rollback).not.toContain("CREATE TABLE");
  });

  it("ignores '-- rollback' mentions inside comments", () => {
    const sql = `-- header mentions \`-- rollback\` block at the bottom\nSELECT 1;\n\n-- rollback\n-- DROP TABLE t;\n`;
    const { forward, rollback } = splitRollback(sql);
    expect(forward).toContain("SELECT 1");
    expect(forward).not.toContain("DROP TABLE");
    expect(rollback.trim()).toBe("DROP TABLE t;");
  });
});

describe("telegramUsernameSuffixFromRequestId", () => {
  it("strips base64url hyphens from the suffix", () => {
    expect(telegramUsernameSuffixFromRequestId("abc-def-ghij")).toBe("abcdef");
    expect(telegramUsernameSuffixFromRequestId("abc-def-ghij")).toMatch(/^[A-Za-z0-9_]+$/);
  });
});
