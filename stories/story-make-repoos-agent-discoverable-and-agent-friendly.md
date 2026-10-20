---
name: "# Story: Make RepoOS Agent-Discoverable and Agent-Friendly"
number: "0011"
created_at: "2026-10-20T15:29:53.553Z"
created_by: hello@repoos.org
---
# Story: Make RepoOS Agent-Discoverable and Agent-Friendly

## Objective

Make RepoOS one of the easiest developer tools for external AI coding agents to discover, understand, install, and operate.

Our users are developers who work with AI coding agents such as Claude Code, Codex, OpenCode, Cursor, and others.

We want those developers to be able to tell their agent:

> "Take a look at https://repoos.org, understand how it works, and help me set it up in this repository."

The agent should be able to accomplish this efficiently, using accurate documentation, established agent-facing conventions, and minimal token consumption.

**This story covers both the technical infrastructure for agent-readable documentation and the human-facing UX that encourages developers to use their existing agents to explore RepoOS.**

## Product Philosophy

RepoOS is built for small engineering teams and independent developers using AI to build maintainable software efficiently.

We explicitly do not optimize for unlimited token consumption or large fleets of expensive agents.

The agent-facing experience should reflect this philosophy:

- Minimal context required to get started.
- Progressive disclosure instead of dumping enormous documentation.
- Accurate, practical instructions.
- No redundant documentation.
- No unnecessary dependency on a particular AI provider.
- Works with different coding agents and models.
- Git-native, CLI-first workflows.
- Human-readable and machine-readable formats.
- One canonical source of truth.

Do not implement standards merely to check boxes. Every component should have a practical purpose.

## Workstream 1: Agent-Readable Documentation

Implement support for `llms.txt` on the public RepoOS sites.

### Landing site

Expose:

`https://repoos.org/llms.txt`

This should provide a concise overview of RepoOS, including:

- What RepoOS is and the problems it solves.
- Who it is designed for.
- Core concepts and architecture.
- Verified installation instructions or links to them.
- Links to getting-started guides.
- Links to CLI documentation.
- Links to agent integration guidance.
- Links to the GitHub/GitLab repository, where publicly available.
- Links to the complete documentation site.

Follow the conventions at https://llmstxt.org/.

Keep the file concise and easy for an agent to consume.

### Documentation site

Expose:

`https://docs.repoos.org/llms.txt`

Generate a structured index of documentation pages using existing VitePress Markdown sources.

Also expose:

`https://docs.repoos.org/llms-full.txt`

This should provide a consolidated version of the documentation for agents that prefer loading the complete reference.

**Important:** Generate these files automatically from canonical documentation sources. Do not manually maintain duplicate copies of documentation.

Investigate whether `vitepress-plugin-llms` is suitable for our current VitePress version and build setup.

Prefer a mature, low-maintenance solution over a custom implementation.

### Individual Markdown pages

Where practical, expose documentation pages in raw Markdown in addition to their normal HTML form.

This allows agents to retrieve specific topics without parsing HTML or loading the entire documentation.

Preserve all existing human-facing documentation URLs.

## Workstream 2: Official RepoOS Agent Skill

Create an official, portable RepoOS Agent Skill following:

https://agentskills.io/specification

The skill should teach an unfamiliar coding agent how to use RepoOS.

Cover:

1. Understanding what RepoOS does.
2. Checking whether RepoOS is already installed.
3. Installing RepoOS using verified installation commands.
4. Initializing RepoOS in an existing Git repository.
5. Understanding the RepoOS project structure.
6. Understanding `repoos/work/`, `repoos/docs/`, and `AGENTS.md` where applicable.
7. Discovering the available RepoOS CLI commands.
8. Creating and managing tasks and stories.
9. Working safely with existing Git changes.
10. Finding detailed documentation when needed.

Use progressive disclosure.

Keep `SKILL.md` short and include supporting Markdown references for more advanced workflows.

Do not duplicate the entire user manual in the skill.

Verify instructions against actual CLI behavior and existing application functionality.

Do not invent commands or configuration options.

Determine the appropriate public location, installation instructions, and distribution method for the skill.

The skill should be usable across multiple compatible coding agents rather than tied to one provider.

## Workstream 3: Landing Page — Agent-Friendly Call to Action

Add a small, polished section to the RepoOS landing page specifically for developers who already use AI coding agents.

Suggested copy:

### Building with an AI coding agent?

**Your agent can help you get started with RepoOS.**

Point Claude Code, Codex, OpenCode, Cursor, or your preferred coding agent at RepoOS. It can read the documentation, understand the workflow, and help you set things up.

Include an easy-to-copy example prompt:

> Explore https://repoos.org and its agent documentation. Explain how RepoOS works, check whether it fits my current repository, and help me install and initialize it if appropriate. Verify commands before running them, preserve my existing files and Git changes, and ask before making significant modifications.

Provide a prominent but tasteful **Copy prompt** button.

Also include a link to the agent-oriented getting-started guide on the docs site.

### Design requirements

- Match the existing RepoOS landing-page visual identity.
- Keep the section compact and visually appealing.
- Do not turn it into an oversized hero section.
- Make the purpose immediately understandable to developers.
- Work well on mobile and desktop.
- Avoid provider-specific branding or logos unless they genuinely help the design.
- Use accessible controls and provide copy-success feedback.

This section should complement, not replace, our existing human-oriented installation and getting-started experience.

## Workstream 4: Documentation Site — Agent Onboarding

Add a dedicated documentation page:

**Getting Started with an AI Coding Agent**

Suggested URL:

`https://docs.repoos.org/getting-started/ai-agents`

Adapt the URL to the existing documentation structure if necessary.

This page should explain how developers can use their existing coding agent to learn and set up RepoOS.

Include:

- A short explanation of the agent-assisted onboarding approach.
- A copyable starter prompt.
- Links to `llms.txt` and the agent skill.
- A brief description of the installation and initialization process.
- Guidance on allowing an agent to inspect a repository before making changes.
- Examples for common compatible agents where useful.
- Security and permission guidance.
- Links to the normal getting-started and CLI documentation.

The page should be written for human developers but optimized for agents to read as well.

### Docs homepage integration

Add a smaller version of the landing-page call to action to the documentation homepage.

Suggested wording:

**Using an AI coding agent?**

Give your agent our documentation and let it help you install, configure, and learn RepoOS.

Include:

- Copy prompt
- Agent getting-started guide link

Make this discoverable but not intrusive.

## Workstream 5: Documentation Accuracy and Automation

All published agent instructions must be correct.

Before generating content:

- Inspect the actual CLI implementation and help output.
- Verify installation commands.
- Inspect the current generated directory structure.
- Identify the canonical source of CLI and configuration documentation.
- Verify all public URLs.
- Check the current landing-page and VitePress build architecture.

Avoid assumptions based on older marketing copy.

### Build integration

Ensure agent-facing files are included automatically in site builds and deployments.

For the landing page, verify the correct static asset directory.

For VitePress, use the actual current project structure and public directory conventions.

Ensure the deployed URLs resolve at the domain root, not underneath incorrect nested paths.

Add reasonable validation to catch:

- Missing generated files.
- Broken internal links.
- Incorrect installation commands.
- Outdated documentation references.
- Generation failures.

Keep the build process fast and inexpensive.

## Workstream 6: External Agent Testing

Validate the experience from the perspective of an agent with no prior knowledge of RepoOS.

Test the following scenario:

> An unfamiliar developer has an existing Git repository and asks their coding agent to investigate RepoOS and help them adopt it.

Evaluate whether the agent can:

1. Discover the agent-facing documentation.
2. Understand what RepoOS does.
3. Identify the appropriate installation method.
4. Determine whether RepoOS is already installed.
5. Understand how initialization works.
6. Explain the changes it would make.
7. Locate CLI instructions for tasks and stories.
8. Avoid inventing commands.
9. Complete a safe setup in a disposable test repository.

Where feasible, test with more than one coding agent or model.

Consider measuring:

- Tokens consumed to reach successful understanding/setup.
- Number of documentation fetches.
- Whether CLI commands are accurate.
- Number of unnecessary tool calls.
- Setup success rate.

Focus on practical correctness, not artificial benchmarks.

Do not introduce paid inference requirements or expensive testing infrastructure without approval.

## Scope Boundaries

This story does NOT require:

- Building a public RepoOS MCP server.
- Implementing autonomous browser workflows.
- Creating a hosted agent service.
- Building new functionality into the RepoOS CLI.
- Changing the existing task/work management architecture.
- Creating provider-specific integrations for every coding agent.
- Implementing experimental standards without demonstrated value.

`agents.txt` is optional and lower priority. Investigate its usefulness, but do not make it a required deliverable merely because it has been proposed as a standard.

`AGENTS.md` and the portable Agent Skill are more important.

## Acceptance Criteria

- [ ] Landing page serves a valid `llms.txt`.
- [ ] Docs site serves a valid `llms.txt`.
- [ ] Docs site serves an automatically generated `llms-full.txt`.
- [ ] Relevant documentation pages are accessible in agent-friendly Markdown.
- [ ] Official RepoOS Agent Skill exists and follows the Agent Skills specification.
- [ ] Agent instructions use verified installation and CLI commands.
- [ ] Landing page includes an attractive agent-oriented CTA with a working Copy Prompt interaction.
- [ ] Docs homepage includes an agent-oriented CTA.
- [ ] Dedicated AI-agent getting-started guide exists.
- [ ] All new pages and files integrate into existing build/deployment workflows.
- [ ] No unnecessary duplication of canonical documentation.
- [ ] External-agent onboarding workflow has been tested.
- [ ] Existing landing and documentation experiences remain intact.
- [ ] Mobile layouts and accessibility are handled.

## Instructions for the RepoOS PM Agent

Inspect the current repository and documentation architecture before planning implementation.

Break this story into small, independently testable tasks with clear dependencies and acceptance criteria.

Suggested areas:

1. Agent documentation generation and publication.
2. RepoOS Agent Skill.
3. Agent getting-started guide.
4. Landing-page agent CTA.
5. Docs homepage agent CTA.
6. Build validation and external-agent testing.

You may combine or split tasks depending on actual codebase boundaries.

Prioritize getting the canonical agent-readable documentation working before publishing promotional CTAs that link to it.

Prefer reusing existing infrastructure and documentation over introducing new systems.

**End goal:** A developer should be able to give their preferred AI coding agent the RepoOS website URL and have that agent efficiently understand the product and help them adopt RepoOS, with minimal tokens, reliable instructions, and no unnecessary human intervention.

## Additional Requirement: Shared Agent CTA and Canonical Starter Prompt

The landing page and docs homepage must use the **same starter prompt and consistent CTA design**.

### Single source of truth
- Maintain the starter prompt in one canonical location.
- Both sites must consume the same source wherever the existing build architecture permits.
- Do not independently hardcode duplicate versions of the prompt.
- Changes to the canonical prompt should automatically propagate to both sites during their builds.
- Keep the prompt concise, provider-agnostic, and focused on safe RepoOS discovery and onboarding.

### CTA design
Use the same compact, polished design on both sites:

**Building with an AI coding agent?**

Your agent can help you get started with RepoOS.

Display a short preview of the starter prompt, with:
- A prominent **Copy prompt for your agent** button.
- A secondary link to the AI-agent getting-started guide.
- Clear copy-success feedback.

Keep the design minimal, visually consistent with each site's theme, and mobile-friendly.

### Acceptance criteria
- [ ] Both CTAs copy exactly the same prompt.
- [ ] The prompt has one canonical source.
- [ ] Both CTAs share the same information hierarchy and interaction behavior.
- [ ] Changes to the canonical prompt are reflected on both sites.
- [ ] No duplicate prompt content is maintained independently.
