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
  // "dark" = default dark but togglable (VitePress's built-in appearance
  // switcher renders in the navbar). Identity stays dark-first to match
  // ui-app and the landing page's own default.
  appearance: "dark",
  lastUpdated: true,
  // README.md here is the build/deploy runbook for this directory, not a page.
  srcExclude: ["README.md"],
  // Links reaching outside the site (../docs/, ../src/) are repo-relative by
  // design; they resolve on a checkout, not on the published site.
  ignoreDeadLinks: [/^\.{1,2}\//],
  head: [
    // (VitePress injects its own pre-paint `check-dark-mode` script when
    // appearance is enabled — it resolves the stored preference (defaulting
    // to dark, see appearance above) before first paint. No manual class
    // script here: it would fight the toggle and flash on light mode.)
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
    // github-dark in BOTH themes on purpose — code blocks stay dark in light
    // mode, same deliberate choice as the landing page's terminal surfaces
    // (.term/.file-card/.install-box). github-dark + a dark --vp-code-block-bg.
    theme: { light: "github-dark", dark: "github-dark" },
    lineNumbers: false,
  },
  themeConfig: {
    siteTitle: "RepoOS",
    logo: "/favicon.svg",
    nav: [
      { text: "Get started", link: "/getting-started" },
      { text: "Agents", link: "/agents" },
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
          { text: "Adding RepoOS to an existing repo", link: "/existing-repo" },
        ],
      },
      {
        text: "Using RepoOS",
        items: [
          { text: "Agents", link: "/agents" },
          { text: "Review and close-out", link: "/review-and-close-out" },
          { text: "The check gate", link: "/check" },
          { text: "Tunnels", link: "/tunnels" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "Configuration", link: "/configuration" },
        ],
      },
      {
        text: "Help",
        items: [{ text: "Troubleshooting", link: "/troubleshooting" }],
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
      message:
        "FSL-1.1-MIT — free to use, self-host and modify; converts to MIT two years after release.",
      copyright: "Copyright © 2026 RepoOS contributors",
    },
  },
});
