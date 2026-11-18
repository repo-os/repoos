import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const agentsView = readFileSync(resolve(__dirname, "../src/views/AgentsView.vue"), "utf8");
const agentCard = readFileSync(resolve(__dirname, "../src/components/AgentCard.vue"), "utf8");

describe("keyboard and screen-reader affordances", () => {
  it("gives the Agents skills dialog close control a descriptive accessible name", () => {
    expect(agentsView).toMatch(
      /<DialogClose class="close-x" aria-label="Close dialog">×<\/DialogClose>/,
    );
  });

  it("names each Agent card's skills button for its agent", () => {
    expect(agentCard).toMatch(
      /class="agent-skills-add"[\s\S]*?:aria-label="`Add skills to \$\{agent\.name\}`"/,
    );
  });
});
