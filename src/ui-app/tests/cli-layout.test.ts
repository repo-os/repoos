/**
 * Shared CLI layout helpers (#0591) — pure functions, asserted at fixed widths
 * so the terminal's real size never enters the test.
 */
import { describe, expect, it } from "vitest";
import { kv, table, termWidth, visibleWidth, wrap } from "../../cli/layout.js";

const WIDTHS = [60, 80, 140];

function lineWidths(s: string): number[] {
  return s.split("\n").map(visibleWidth);
}

describe("visibleWidth", () => {
  it("ignores ANSI SGR codes", () => {
    expect(visibleWidth("plain")).toBe(5);
    expect(visibleWidth("\x1b[1m\x1b[31mred\x1b[39m\x1b[22m")).toBe(3);
    expect(visibleWidth("\x1b[2mab\x1b[22m cd")).toBe(5);
  });
});

describe("termWidth", () => {
  it("prefers the TTY width, capped at 100", () => {
    expect(termWidth({}, 60)).toBe(60);
    expect(termWidth({}, 200)).toBe(100);
  });

  it("falls back to $COLUMNS when stdout is not a TTY", () => {
    expect(termWidth({ COLUMNS: "72" }, undefined)).toBe(72);
    expect(termWidth({ COLUMNS: "500" }, undefined)).toBe(100);
  });

  it("defaults to 80 when neither is available", () => {
    expect(termWidth({}, undefined)).toBe(80);
    expect(termWidth({ COLUMNS: "nonsense" }, undefined)).toBe(80);
    expect(termWidth({ COLUMNS: "0" }, undefined)).toBe(80);
  });
});

describe("wrap", () => {
  const text =
    "Definition-of-done gate: runs the check plan declared in repoos.toml, including every " +
    "step held back from a routine run and any step affected by the changed paths";

  it("never exceeds the width at 60, 80 or 140", () => {
    for (const width of WIDTHS) {
      expect(Math.max(...lineWidths(wrap(text, width)))).toBeLessThanOrEqual(width);
    }
  });

  it("applies a hanging indent to every line", () => {
    const indent = "      ";
    const out = wrap(text, 40, indent);
    for (const line of out.split("\n")) expect(line.startsWith(indent)).toBe(true);
    for (const line of out.split("\n")) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(indent.length + 40);
    }
  });

  it("keeps words intact when they fit", () => {
    const out = wrap("alpha beta gamma", 11);
    expect(out.split("\n")).toEqual(["alpha beta", "gamma"]);
  });

  it("hard-breaks a word longer than the line", () => {
    const word = "x".repeat(25);
    const out = wrap(word, 10);
    expect(out.split("\n")).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("hard-breaks a long word without counting its ANSI codes", () => {
    const out = wrap("\x1b[36m" + "y".repeat(12) + "\x1b[39m", 5);
    expect(lineWidths(out)).toEqual([5, 5, 2]);
  });

  it("treats explicit newlines as line breaks", () => {
    expect(wrap("one\ntwo", 40)).toBe("one\ntwo");
  });
});

describe("table", () => {
  const rows = [
    { label: "doctor", description: "Readiness preflight: " + "detail ".repeat(12).trim() },
    { label: "serve", description: "Start the local server" },
  ];

  it("stays within the width at 60, 80 and 140", () => {
    for (const width of WIDTHS) {
      const out = table(rows, { indent: 4, gap: 2, width });
      expect(Math.max(...lineWidths(out))).toBeLessThanOrEqual(width);
    }
  });

  it("aligns continuation lines under the description column", () => {
    const out = table([{ label: "doctor", description: "Readiness " + "detail ".repeat(12) }], {
      indent: 4,
      gap: 2,
      width: 40,
    }).split("\n");
    const descCol = out[0].indexOf("Readiness");
    expect(descCol).toBeGreaterThan(0);
    for (const line of out.slice(1)) {
      expect(line.length - line.trimStart().length).toBe(descCol);
    }
  });

  it("sizes the label column to the widest label", () => {
    const out = table(
      [
        { label: "a", description: "first" },
        { label: "long-label", description: "second" },
      ],
      { indent: 2, gap: 2, width: 80 },
    ).split("\n");
    expect(out[0].indexOf("first")).toBe(out[1].indexOf("second"));
  });
});

describe("kv", () => {
  it("renders a label/value pair with wrapping", () => {
    const out = kv([{ label: "Local", value: "http://127.0.0.1:7515" }], { indent: 2 });
    expect(out).toBe("  Local  http://127.0.0.1:7515");
  });
});
