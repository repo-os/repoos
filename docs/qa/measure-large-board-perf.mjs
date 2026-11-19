#!/usr/bin/env bun
// Measures the Work board against a generated 1200-task fixture at 375, 768
// and 1280 px (#1251). Headless WebKit only; the UI is served from dist/ui and
// the board payload is generated in memory, so no repository or server is used.
//
// Usage: bun run build:ui && bun docs/qa/measure-large-board-perf.mjs [taskCount]
import { webkit } from "@playwright/test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { makeLargeBoard } from "../../src/ui-app/tests/large-board-fixture.ts";
import { measureWidth } from "../../src/ui-app/tests/large-board-measure.ts";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const distDir = resolve(root, "dist/ui");
const taskCount = Number(process.argv[2] ?? 1200);
const board = makeLargeBoard(taskCount);

const browser = await webkit.launch();
const results = [];
try {
  for (const width of [375, 768, 1280]) {
    const r = await measureWidth(browser, { width, board, distDir });
    results.push(r);
    console.log(JSON.stringify(r));
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ taskCount: board.taskCount, results }, null, 2));
