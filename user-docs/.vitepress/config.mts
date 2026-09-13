import { defineConfig } from "vitepress";

// docs.repoos.org — documentation for PEOPLE USING RepoOS.
// Deploy target: Cloudflare Pages (main branch → dev env, prod branch → prod).
// Build command `bun run build` (here), output dir `.vitepress/dist`.
//
// The content here is authored for users adopting RepoOS in their own repo.
// It is deliberately NOT sourced from this repo's `docs/`: that directory is a
// RepoOS convention (`repoos init` creates it in every managed repo) holding
// the build context for the project it lives in — for this repo, the history
// and rationale of building RepoOS itself. Different audience, different
// purpose. See ../docs/README.md.
export default defineConfig({
  lang: "en",
  title: "RepoOS",
  description:
    "The repo is the operating system. Repo-native tasks and specs as markdown files, agents as a first-class workforce, humans at the sign-off gate.",
  cleanUrls: true,
  // Dark-only identity (matches ui-app). No light theme.
  appearance: "force-dark",
  lastUpdated: true,
  // README.md here is the build/deploy runbook for this directory, not a page.
  srcExclude: ["README.md"],
  // Links reaching outside the site (../docs/, ../src/) are repo-relative by
  // design; they resolve on a checkout, not on the published site.
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
      { text: "Get started", link: "/getting-started" },
      { text: "CLI", link: "/cli" },
      { text: "Configuration", link: "/configuration" },
      { text: "repoos.org", link: "https://repoos.org" },
    ],
    // Hand-curated (VitePress does not generate this from the file tree).
    // A new page must be added here or it won't appear in navigation, even
    // though it still builds and is reachable by direct URL.
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Install and first task", link: "/getting-started" },
          { text: "Concepts", link: "/concepts" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: "https://github.com/repo-os/repoos" }],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    lastUpdated: { text: "Updated" },
    editLink: {
      pattern: "https://github.com/repo-os/repoos/edit/main/user-docs/:path",
      text: "Edit this page on GitHub",
    },
    footer: {
      message: "MIT licensed. The repo is the operating system.",
      copyright: "Copyright © 2026 RepoOS contributors",
    },
  },
});
