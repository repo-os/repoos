import { fileURLToPath } from "node:url";
import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";
import { themeBootPlugin, themeBootScriptContent } from "./vite-plugin-theme-boot";
import { LLMS_INDEX_EXCLUDED_SOURCES, SITE_ORIGIN, llmsIndexTemplate } from "./llms-index";

// The header mark's geometry is shared with the landing page (repo-root
// `shared/logo.ts`), which sits above this project's root. The dev server —
// what task previews run — needs explicit permission to serve it; the static
// build has no such restriction.
const sharedRoot = fileURLToPath(new URL("../../shared", import.meta.url));

const themeBootInline = themeBootScriptContent();

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
    "AI dev teams for CTOs and builders. Bring your own agents and models. RepoOS manages the whole development lifecycle — all in your Git repo.",
  cleanUrls: true,
  // RepoOS owns appearance (dark/light) and design theme (Classic/Gruvbox).
  // `false` disables VitePress's built-in toggle and its `check-dark-mode`
  // script — that script reads `vitepress-theme-appearance`, which would fight
  // our `repoos-theme` key. Pre-paint boot (`theme-boot.ts` via
  // vite-plugin-theme-boot) applies both axes before first paint instead.
  appearance: false,
  lastUpdated: true,
  // README.md here is the build/deploy runbook for this directory, not a page.
  srcExclude: ["README.md"],
  // Links reaching outside the site (../docs/, ../src/) are repo-relative by
  // design; they resolve on a checkout, not on the published site.
  ignoreDeadLinks: [/^\.{1,2}\//],
  vite: {
    server: {
      fs: {
        // Concatenated onto VitePress's own [client, srcDir, workspace] list.
        allow: [sharedRoot],
      },
    },
    plugins: [
      themeBootPlugin(),
      // Publishes the public manual to agents alongside the HTML pages:
      // /llms.txt (index), /llms-full.txt (whole manual), and each page as
      // raw Markdown at the same route with `.md` appended. It reads the same
      // `user-docs/*.md` sources, so there is no second copy to drift. The
      // post-build check in `scripts/check-llms.ts` enforces that every page
      // is represented. See `llms-index.ts` for the exclusions and template.
      llmstxt({
        domain: SITE_ORIGIN,
        // README.md and index.md are recorded in `llms-index.ts`.
        ignoreFiles: [...LLMS_INDEX_EXCLUDED_SOURCES],
        excludeIndexPage: true,
        customLLMsTxtTemplate: llmsIndexTemplate,
      }),
    ],
  },
  head: [
    ["script", { id: "repoos-theme-boot" }, themeBootInline],
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
    nav: [
      { text: "Get started", link: "/getting-started" },
      { text: "Agents", link: "/agents" },
      { text: "CLI", link: "/cli" },
      { text: "Configuration", link: "/configuration" },
      { text: "Environment & secrets", link: "/environment-and-secrets" },
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
          { text: "Set up with an AI coding agent", link: "/ai-agents" },
          {
            text: "Starting a project as an agent",
            link: "/getting-started#starting-a-new-project-as-an-agent",
          },
          { text: "Concepts", link: "/concepts" },
          { text: "Adding RepoOS to an existing repo", link: "/existing-repo" },
        ],
      },
      {
        text: "Using RepoOS",
        items: [
          { text: "Agents", link: "/agents" },
          { text: "Built-in agents", link: "/built-in-agents" },
          { text: "Coding harness compatibility", link: "/coding-harness-compatibility" },
          { text: "Review and close-out", link: "/review-and-close-out" },
          { text: "Running with AI agents", link: "/running-with-agents" },
          { text: "Notices and notifications", link: "/notifications" },
          { text: "Checks before merge", link: "/check" },
          { text: "Remote engineer sessions (planned)", link: "/remote-engineers" },
          { text: "Tunnels", link: "/tunnels" },
          { text: "Dev targets", link: "/dev-targets" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "CLI", link: "/cli" },
          { text: "Configuration", link: "/configuration" },
          { text: "Environment and secrets", link: "/environment-and-secrets" },
          { text: "Authentication", link: "/authentication" },
          { text: "Native authentication", link: "/native-auth" },
          { text: "Telegram", link: "/telegram" },
          { text: "Deployments and releases", link: "/deployments-and-releases" },
          { text: "Changelog", link: "/changelog" },
        ],
      },
      {
        text: "Apps",
        items: [{ text: "RepoOS Hub for Mac", link: "/macos-hub" }],
      },
      {
        text: "Help",
        items: [{ text: "Troubleshooting", link: "/troubleshooting" }],
      },
    ],
    socialLinks: [
      // aria-label doubles as the visible label of the GitHub row in the
      // mobile nav screen (see `#VPNavScreen .social-links` in theme/custom.css).
      { icon: "github", link: "https://github.com/repo-os/repoos", ariaLabel: "GitHub" },
    ],
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
