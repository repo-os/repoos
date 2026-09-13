import { defineConfig } from "vitepress";

// docs.repoos.org — republishes this repo's docs/*.md as a VitePress site.
// Deploy target: Cloudflare Pages (main branch → dev env, prod branch → prod).
// Build command `bun run build` (here), output dir `.vitepress/dist`.
export default defineConfig({
  lang: "en",
  title: "RepoOS",
  description:
    "The repo is the operating system. Repo-native tasks and specs as markdown files, agents as a first-class workforce, humans at the sign-off gate.",
  cleanUrls: true,
  // Dark-only identity (matches ui-app). No light theme.
  appearance: "force-dark",
  lastUpdated: true,
  // docs/agents/ holds raw agent reports, not product docs; README.md is the
  // build/deploy runbook, not a site page.
  srcExclude: ["agents/**", "README.md"],
  // Links reaching outside the site (../src/, ../work/) are repo-relative by
  // design; they resolve on a checkout, not on the published site. VitePress
  // reports them with a ./ or ../ prefix relative to srcDir.
  ignoreDeadLinks: [/^\.{1,2}\//],
  head: [
    // force-dark only adds the class at hydration; set it before first paint
    // so prerendered pages (and crawlers) get the dark theme immediately.
    ["script", {}, 'document.documentElement.classList.add("dark")'],
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap",
      },
    ],
  ],
  markdown: {
    theme: { light: "github-dark", dark: "github-dark" },
    lineNumbers: false,
  },
  themeConfig: {
    siteTitle: "RepoOS",
    logo: "/favicon.svg",
    nav: [
      { text: "Docs", link: "/vision" },
      { text: "ADRs", link: "/adr/" },
      { text: "Roadmap", link: "/roadmap" },
      { text: "repoos.org", link: "https://repoos.org" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Vision", link: "/vision" },
          { text: "Concepts", link: "/concepts" },
          { text: "Roadmap", link: "/roadmap" },
        ],
      },
      {
        text: "Architecture",
        items: [
          { text: "Architecture", link: "/architecture" },
          { text: "Close-out pipeline", link: "/close-out-pipeline" },
          { text: "Remote validation", link: "/remote-validation" },
          { text: "Tunnel registry", link: "/tunnel-registry" },
          { text: "Native auth", link: "/native-auth" },
          { text: "Releases", link: "/releases" },
        ],
      },
      {
        text: "Agents & models",
        items: [
          { text: "Agent model recommendations", link: "/agent-model-recommendations" },
          { text: "OpenCode models", link: "/opencode-models" },
          { text: "Token optimization", link: "/token-optimization" },
          { text: "Prompt caching audit", link: "/prompt-caching-audit" },
        ],
      },
      {
        text: "Mobile",
        collapsed: true,
        items: [
          { text: "Mobile architecture", link: "/mobile-architecture" },
          { text: "Mobile UX strategy", link: "/mobile-ux-strategy" },
        ],
      },
      {
        text: "Dogfooding",
        collapsed: true,
        items: [{ text: "Dogfooding vs general repos", link: "/dogfooding-vs-general" }],
      },
      {
        text: "Architecture decisions",
        collapsed: true,
        items: [
          { text: "Overview", link: "/adr/" },
          { text: "ADR-0001 · Repo-native tasks", link: "/adr/0001-repo-native-tasks" },
          { text: "ADR-0002 · Status as frontmatter", link: "/adr/0002-status-as-frontmatter" },
          { text: "ADR-0003 · Self-hosting", link: "/adr/0003-self-hosting" },
          { text: "ADR-0004 · Plugin architecture", link: "/adr/0004-plugin-architecture" },
          {
            text: "ADR-0005 · Agents use RepoOS APIs",
            link: "/adr/0005-agents-use-repoos-apis-for-privileged-operations",
          },
        ],
      },
      {
        text: "Audits",
        collapsed: true,
        items: [{ text: "Agent skill gap audit", link: "/audits/2026-08-agent-skill-gap-audit" }],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/repo-os/repoos" }],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    lastUpdated: { text: "Updated" },
    editLink: {
      pattern: "https://github.com/repo-os/repoos/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "MIT licensed. The repo is the operating system.",
      copyright: "Copyright © 2026 RepoOS contributors",
    },
  },
});
