import { describe, expect, it } from "vitest";
import type { Agent, RepoOSConfig } from "../../core/types";
import { agentsForConfig, DEFAULT_AGENTS } from "../../core/config";
import { repoGuidePrompt, resolveRepoGuide } from "../../server/agents";

const config = (agents: Agent[]): RepoOSConfig => ({
  root: "/tmp/example-repo",
  workDir: "work",
  docsDir: "docs",
  skillsDir: "skills",
  taskExtensions: [".md"],
  defaultStatus: "inbox",
  defaultAssignee: "unassigned",
  cacheDir: ".repoos",
  agents,
});

describe("RepoOS Guide", () => {
  it("is a built-in agent shown alongside older saved agent configurations", () => {
    const saved: Agent[] = [
      { name: "engineer", cli: "codex", model: "gpt-test", enabled: true },
      { name: "my custom role", cli: "opencode", model: "default", enabled: true },
    ];
    const merged = agentsForConfig(config(saved));

    expect(merged.find((agent) => agent.name === "engineer")?.model).toBe("gpt-test");
    expect(merged.some((agent) => agent.name === "my custom role")).toBe(true);
    expect(merged.filter((agent) => agent.name === "RepoOS Guide")).toHaveLength(1);
    expect(DEFAULT_AGENTS.some((agent) => agent.name === "RepoOS Guide")).toBe(true);
  });

  it("honors the Agents-page enabled toggle", () => {
    const guide = DEFAULT_AGENTS.find((agent) => agent.name === "RepoOS Guide")!;
    expect(resolveRepoGuide(config([{ ...guide, enabled: false }]))).toBeNull();
    expect(resolveRepoGuide(config([{ ...guide, enabled: true }]))?.name).toBe("RepoOS Guide");
  });

  it("grounds the chat mission in live repository context and keeps it read-only", () => {
    const guide = DEFAULT_AGENTS.find((agent) => agent.name === "RepoOS Guide")!;
    const prompt = repoGuidePrompt(
      "Which issues are active?",
      "Repository: example\n- #0114 [active] Add persistent chat",
      guide,
    );

    expect(prompt).toContain("Which issues are active?");
    expect(prompt).toContain("#0114 [active]");
    expect(prompt).toContain("Never edit files");
    expect(prompt).toContain("RepoOS Guide");
  });
});
