/**
 * Class guards for two bugs the #1249 review found in sibling call sites:
 *
 *  - `...JSON_OPTS` spreads the helper *function* instead of calling it, so
 *    the request goes out with no `Content-Type` and no body (#1249 review).
 *  - native `confirm()` for an app action: AGENTS.md bans it; app actions use
 *    the shared `ConfirmDialog` (#0641, #1249 review).
 *
 * Each rule scans every .vue/.ts file under `src/ui-app/src`. A rule is a
 * table row, so a new bad form is one more row, not a new test.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "../src");

interface Rule {
  name: string;
  /** Matches a code line that uses the banned form. */
  pattern: RegExp;
  /** Lines that match `pattern` but are legitimate (e.g. a local helper named confirm). */
  allow?: RegExp;
  why: string;
}

const RULES: Rule[] = [
  {
    name: "spread of the JSON_OPTS helper",
    pattern: /\.\.\.JSON_OPTS\b(?!\()/,
    why: "spreads the function, so the request has no JSON headers or body",
  },
  {
    name: "native confirm()",
    pattern: /(^|[^\w.$])(?:window\.)?confirm\(/,
    allow: /function confirm\(/,
    why: "AGENTS.md bans native dialogs for app actions; use ConfirmDialog",
  },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(vue|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Code lines only: comment lines are skipped so docs can name the banned form. */
function findOffenders(rule: Rule, files: { path: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    file.text.split("\n").forEach((line, i) => {
      const code = line.trim();
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      if (rule.allow?.test(line)) return;
      if (rule.pattern.test(line)) {
        hits.push(`${relative(SRC, file.path)}:${i + 1}`);
      }
    });
  }
  return hits;
}

const FILES = sourceFiles(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

describe("sibling-class guards (#1249 review)", () => {
  it("scans a real source tree", () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it.each(RULES)("no $name under ui-app/src ($why)", (rule) => {
    expect(findOffenders(rule, FILES)).toEqual([]);
  });

  // The scanner must actually catch the bad forms, or the guards above prove nothing.
  const SAMPLES: { rule: string; line: string }[] = [
    { rule: "spread of the JSON_OPTS helper", line: "  ...JSON_OPTS," },
    { rule: "spread of the JSON_OPTS helper", line: '{ method: "POST", ...JSON_OPTS }' },
    { rule: "native confirm()", line: "if (!confirm('Really?')) return;" },
    { rule: "native confirm()", line: "if (!window.confirm('Really?')) return;" },
  ];
  it.each(SAMPLES)("catches `$line` as $rule", ({ rule, line }) => {
    const r = RULES.find((x) => x.name === rule)!;
    expect(findOffenders(r, [{ path: "/fixture/x.ts", text: line }])).toHaveLength(1);
  });

  it.each([
    { rule: "spread of the JSON_OPTS helper", line: "JSON_OPTS('POST', body)" },
    { rule: "native confirm()", line: "function confirm(): void {" },
    { rule: "native confirm()", line: "confirmUnbind();" },
    { rule: "native confirm()", line: "// replaces native confirm() for this action" },
  ])("does not flag legitimate `$line`", ({ rule, line }) => {
    const r = RULES.find((x) => x.name === rule)!;
    expect(findOffenders(r, [{ path: "/fixture/x.ts", text: line }])).toEqual([]);
  });
});
