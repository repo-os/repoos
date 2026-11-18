import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentsView = readFileSync(resolve(__dirname, "../src/views/AgentsView.vue"), "utf8");

describe("keyboard and screen-reader affordances", () => {
  it("gives the Agents skills dialog close control a descriptive accessible name", () => {
    expect(agentsView).toMatch(
      /<DialogClose class="close-x" aria-label="Close dialog">×<\/DialogClose>/,
    );
  });
});
