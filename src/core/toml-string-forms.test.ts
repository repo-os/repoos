import { describe, it, expect } from "vitest";
import { parseFlatToml } from "./config.js";
import { unquoteTomlString } from "./toml-line.js";

describe("multi-line TOML strings", () => {
  it("parses ''' literal strings exactly", () => {
    const parsed = parseFlatToml("command = '''echo hi && echo there'''");
    expect((parsed as Record<string, unknown>)["command"]).toBe("echo hi && echo there");
  });

  it('parses """ basic strings exactly', () => {
    const parsed = parseFlatToml('command = """echo hi && echo there"""');
    expect((parsed as Record<string, unknown>)["command"]).toBe("echo hi && echo there");
  });

  it("trims the first newline on multi-line forms", () => {
    const parsed = parseFlatToml("x = '''\nhello\nworld'''");
    expect((parsed as Record<string, unknown>).x).toBe("hello\nworld");
  });

  it("handles embedded single and double quotes", () => {
    const parsed = parseFlatToml("x = '''it's \"great\"'''");
    expect((parsed as Record<string, unknown>).x).toBe('it\'s "great"');
  });

  it('handles """ escapes', () => {
    const parsed = parseFlatToml('x = """line1\\nline2\\\"quote"""');
    expect((parsed as Record<string, unknown>).x).toBe('line1\nline2"quote');
  });

  it("handles multi-line literal with leading newline trimmed", () => {
    const parsed = parseFlatToml("cmd = '''\nhello\nthere'''");
    expect((parsed as Record<string, unknown>)["cmd"]).toBe("hello\nthere");
  });

  it("parses [[dev.targets]] with multi-line command", () => {
    const text = `
[[dev.targets]]
name = "test"
kind = "process"
command = '''echo hi && echo there'''
`;
    const parsed = parseFlatToml(text);
    expect(Array.isArray(parsed["dev.targets"])).toBe(true);
    const rows = parsed["dev.targets"] as Record<string, unknown>[];
    expect(rows.length).toBe(1);
    expect(rows[0].command).toBe("echo hi && echo there");
  });

  it("unquoteTomlString handles ''' and \"\"\"", () => {
    expect(unquoteTomlString("'''a'''")).toBe("a");
    expect(unquoteTomlString('"""a"""')).toBe("a");
  });
});
