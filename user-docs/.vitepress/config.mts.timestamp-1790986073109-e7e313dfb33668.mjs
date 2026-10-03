// .vitepress/config.mts
import { defineConfig } from "file:///Users/nick/code/nick/repoos-worktrees/feat/add-and-delete-evidence-shots-from-the-t/user-docs/node_modules/vitepress/dist/node/index.js";

// .vitepress/vite-plugin-theme-boot.ts
import { buildSync } from "file:///Users/nick/code/nick/repoos-worktrees/feat/add-and-delete-evidence-shots-from-the-t/user-docs/node_modules/esbuild/lib/main.js";
import { fileURLToPath } from "node:url";
var __vite_injected_original_import_meta_url = "file:///Users/nick/code/nick/repoos-worktrees/feat/add-and-delete-evidence-shots-from-the-t/user-docs/.vitepress/vite-plugin-theme-boot.ts";
var bootEntry = fileURLToPath(new URL("./theme/theme-boot.ts", __vite_injected_original_import_meta_url));
var MARKER = 'id="repoos-theme-boot"';
function bundleThemeBoot() {
  const result = buildSync({
    entryPoints: [bootEntry],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true
  });
  return result.outputFiles[0].text;
}
var cachedBoot;
function themeBootScriptContent() {
  cachedBoot ??= bundleThemeBoot();
  return cachedBoot;
}
function themeBootPlugin() {
  return {
    name: "repoos-docs-theme-boot",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const code = themeBootScriptContent();
        const scriptTag = `<script ${MARKER}>${code}</script>`;
        if (html.includes(MARKER)) {
          return html.replace(new RegExp(`<script ${MARKER}>[\\s\\S]*?</script>`, "m"), scriptTag);
        }
        return html.replace("<head>", `<head>
    ${scriptTag}`);
      }
    }
  };
}

// .vitepress/config.mts
var themeBootInline = themeBootScriptContent();
var config_default = defineConfig({
  lang: "en",
  title: "RepoOS",
  description: "AI dev teams for CTOs and builders. Bring your own agents and models. RepoOS manages the whole development lifecycle \u2014 all in your Git repo.",
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
    plugins: [themeBootPlugin()]
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
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap"
      }
    ]
  ],
  markdown: {
    // github-dark in BOTH themes on purpose — code blocks stay dark in light
    // mode, same deliberate choice as the landing page's terminal surfaces
    // (.term/.file-card/.install-box). github-dark + a dark --vp-code-block-bg.
    theme: { light: "github-dark", dark: "github-dark" },
    lineNumbers: false
  },
  themeConfig: {
    siteTitle: "RepoOS",
    logo: "/favicon.svg",
    nav: [
      { text: "Get started", link: "/getting-started" },
      { text: "Agents", link: "/agents" },
      { text: "CLI", link: "/cli" },
      { text: "Configuration", link: "/configuration" },
      { text: "Environment & secrets", link: "/environment-and-secrets" },
      { text: "repoos.org", link: "https://repoos.org" }
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
          { text: "Adding RepoOS to an existing repo", link: "/existing-repo" }
        ]
      },
      {
        text: "Using RepoOS",
        items: [
          { text: "Agents", link: "/agents" },
          { text: "Built-in agents", link: "/built-in-agents" },
          { text: "Coding harness compatibility", link: "/coding-harness-compatibility" },
          { text: "Review and close-out", link: "/review-and-close-out" },
          { text: "Checks before merge", link: "/check" },
          { text: "Tunnels", link: "/tunnels" }
        ]
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
          { text: "Changelog", link: "/changelog" }
        ]
      },
      {
        text: "Apps",
        items: [{ text: "RepoOS Hub for Mac", link: "/macos-hub" }]
      },
      {
        text: "Help",
        items: [{ text: "Troubleshooting", link: "/troubleshooting" }]
      }
    ],
    socialLinks: [
      // aria-label doubles as the visible label of the GitHub row in the
      // mobile nav screen (see `#VPNavScreen .social-links` in theme/custom.css).
      { icon: "github", link: "https://github.com/repo-os/repoos", ariaLabel: "GitHub" }
    ],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "On this page" },
    lastUpdated: { text: "Updated" },
    editLink: {
      pattern: "https://github.com/repo-os/repoos/edit/main/user-docs/:path",
      text: "Edit this page on GitHub"
    },
    footer: {
      message: "FSL-1.1-MIT \u2014 free to use, self-host and modify; converts to MIT two years after release.",
      copyright: "Copyright \xA9 2026 RepoOS contributors"
    }
  }
});
export {
  config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLnZpdGVwcmVzcy9jb25maWcubXRzIiwgIi52aXRlcHJlc3Mvdml0ZS1wbHVnaW4tdGhlbWUtYm9vdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9uaWNrL2NvZGUvbmljay9yZXBvb3Mtd29ya3RyZWVzL2ZlYXQvYWRkLWFuZC1kZWxldGUtZXZpZGVuY2Utc2hvdHMtZnJvbS10aGUtdC91c2VyLWRvY3MvLnZpdGVwcmVzc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiL1VzZXJzL25pY2svY29kZS9uaWNrL3JlcG9vcy13b3JrdHJlZXMvZmVhdC9hZGQtYW5kLWRlbGV0ZS1ldmlkZW5jZS1zaG90cy1mcm9tLXRoZS10L3VzZXItZG9jcy8udml0ZXByZXNzL2NvbmZpZy5tdHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL1VzZXJzL25pY2svY29kZS9uaWNrL3JlcG9vcy13b3JrdHJlZXMvZmVhdC9hZGQtYW5kLWRlbGV0ZS1ldmlkZW5jZS1zaG90cy1mcm9tLXRoZS10L3VzZXItZG9jcy8udml0ZXByZXNzL2NvbmZpZy5tdHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZXByZXNzXCI7XG5pbXBvcnQgeyB0aGVtZUJvb3RQbHVnaW4sIHRoZW1lQm9vdFNjcmlwdENvbnRlbnQgfSBmcm9tIFwiLi92aXRlLXBsdWdpbi10aGVtZS1ib290XCI7XG5cbmNvbnN0IHRoZW1lQm9vdElubGluZSA9IHRoZW1lQm9vdFNjcmlwdENvbnRlbnQoKTtcblxuLy8gZG9jcy5yZXBvb3Mub3JnIFx1MjAxNCBkb2N1bWVudGF0aW9uIGZvciBQRU9QTEUgVVNJTkcgUmVwb09TLlxuLy8gRGVwbG95IHRhcmdldDogQ2xvdWRmbGFyZSBQYWdlcyAobWFpbiBicmFuY2ggXHUyMTkyIGRldiBlbnYsIHByb2QgYnJhbmNoIFx1MjE5MiBwcm9kKS5cbi8vIEJ1aWxkIGNvbW1hbmQgYGJ1biBydW4gYnVpbGRgIChoZXJlKSwgb3V0cHV0IGRpciBgLnZpdGVwcmVzcy9kaXN0YC5cbi8vXG4vLyBUaGUgY29udGVudCBoZXJlIGlzIGF1dGhvcmVkIGZvciB1c2VycyBhZG9wdGluZyBSZXBvT1MgaW4gdGhlaXIgb3duIHJlcG8uXG4vLyBJdCBpcyBkZWxpYmVyYXRlbHkgTk9UIHNvdXJjZWQgZnJvbSB0aGlzIHJlcG8ncyBgZG9jcy9gOiB0aGF0IGRpcmVjdG9yeSBpcyBhXG4vLyBSZXBvT1MgY29udmVudGlvbiAoYHJlcG9vcyBpbml0YCBjcmVhdGVzIGl0IGluIGV2ZXJ5IG1hbmFnZWQgcmVwbykgaG9sZGluZ1xuLy8gdGhlIGJ1aWxkIGNvbnRleHQgZm9yIHRoZSBwcm9qZWN0IGl0IGxpdmVzIGluIFx1MjAxNCBmb3IgdGhpcyByZXBvLCB0aGUgaGlzdG9yeVxuLy8gYW5kIHJhdGlvbmFsZSBvZiBidWlsZGluZyBSZXBvT1MgaXRzZWxmLiBEaWZmZXJlbnQgYXVkaWVuY2UsIGRpZmZlcmVudFxuLy8gcHVycG9zZS4gU2VlIC4uL2RvY3MvUkVBRE1FLm1kLlxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgbGFuZzogXCJlblwiLFxuICB0aXRsZTogXCJSZXBvT1NcIixcbiAgZGVzY3JpcHRpb246XG4gICAgXCJBSSBkZXYgdGVhbXMgZm9yIENUT3MgYW5kIGJ1aWxkZXJzLiBCcmluZyB5b3VyIG93biBhZ2VudHMgYW5kIG1vZGVscy4gUmVwb09TIG1hbmFnZXMgdGhlIHdob2xlIGRldmVsb3BtZW50IGxpZmVjeWNsZSBcdTIwMTQgYWxsIGluIHlvdXIgR2l0IHJlcG8uXCIsXG4gIGNsZWFuVXJsczogdHJ1ZSxcbiAgLy8gUmVwb09TIG93bnMgYXBwZWFyYW5jZSAoZGFyay9saWdodCkgYW5kIGRlc2lnbiB0aGVtZSAoQ2xhc3NpYy9HcnV2Ym94KS5cbiAgLy8gYGZhbHNlYCBkaXNhYmxlcyBWaXRlUHJlc3MncyBidWlsdC1pbiB0b2dnbGUgYW5kIGl0cyBgY2hlY2stZGFyay1tb2RlYFxuICAvLyBzY3JpcHQgXHUyMDE0IHRoYXQgc2NyaXB0IHJlYWRzIGB2aXRlcHJlc3MtdGhlbWUtYXBwZWFyYW5jZWAsIHdoaWNoIHdvdWxkIGZpZ2h0XG4gIC8vIG91ciBgcmVwb29zLXRoZW1lYCBrZXkuIFByZS1wYWludCBib290IChgdGhlbWUtYm9vdC50c2AgdmlhXG4gIC8vIHZpdGUtcGx1Z2luLXRoZW1lLWJvb3QpIGFwcGxpZXMgYm90aCBheGVzIGJlZm9yZSBmaXJzdCBwYWludCBpbnN0ZWFkLlxuICBhcHBlYXJhbmNlOiBmYWxzZSxcbiAgbGFzdFVwZGF0ZWQ6IHRydWUsXG4gIC8vIFJFQURNRS5tZCBoZXJlIGlzIHRoZSBidWlsZC9kZXBsb3kgcnVuYm9vayBmb3IgdGhpcyBkaXJlY3RvcnksIG5vdCBhIHBhZ2UuXG4gIHNyY0V4Y2x1ZGU6IFtcIlJFQURNRS5tZFwiXSxcbiAgLy8gTGlua3MgcmVhY2hpbmcgb3V0c2lkZSB0aGUgc2l0ZSAoLi4vZG9jcy8sIC4uL3NyYy8pIGFyZSByZXBvLXJlbGF0aXZlIGJ5XG4gIC8vIGRlc2lnbjsgdGhleSByZXNvbHZlIG9uIGEgY2hlY2tvdXQsIG5vdCBvbiB0aGUgcHVibGlzaGVkIHNpdGUuXG4gIGlnbm9yZURlYWRMaW5rczogWy9eXFwuezEsMn1cXC8vXSxcbiAgdml0ZToge1xuICAgIHBsdWdpbnM6IFt0aGVtZUJvb3RQbHVnaW4oKV0sXG4gIH0sXG4gIGhlYWQ6IFtcbiAgICBbXCJzY3JpcHRcIiwgeyBpZDogXCJyZXBvb3MtdGhlbWUtYm9vdFwiIH0sIHRoZW1lQm9vdElubGluZV0sXG4gICAgW1wibGlua1wiLCB7IHJlbDogXCJpY29uXCIsIHR5cGU6IFwiaW1hZ2Uvc3ZnK3htbFwiLCBocmVmOiBcIi9mYXZpY29uLnN2Z1wiIH1dLFxuICAgIFtcImxpbmtcIiwgeyByZWw6IFwicHJlY29ubmVjdFwiLCBocmVmOiBcImh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb21cIiB9XSxcbiAgICBbXCJsaW5rXCIsIHsgcmVsOiBcInByZWNvbm5lY3RcIiwgaHJlZjogXCJodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tXCIsIGNyb3Nzb3JpZ2luOiBcIlwiIH1dLFxuICAgIFtcbiAgICAgIFwibGlua1wiLFxuICAgICAge1xuICAgICAgICByZWw6IFwic3R5bGVzaGVldFwiLFxuICAgICAgICBocmVmOiBcImh0dHBzOi8vZm9udHMuZ29vZ2xlYXBpcy5jb20vY3NzMj9mYW1pbHk9U29yYTp3Z2h0QDQwMDs1MDA7NjAwOzcwMDs4MDAmZmFtaWx5PUpldEJyYWlucytNb25vOndnaHRANDAwOzYwMCZkaXNwbGF5PXN3YXBcIixcbiAgICAgIH0sXG4gICAgXSxcbiAgXSxcbiAgbWFya2Rvd246IHtcbiAgICAvLyBnaXRodWItZGFyayBpbiBCT1RIIHRoZW1lcyBvbiBwdXJwb3NlIFx1MjAxNCBjb2RlIGJsb2NrcyBzdGF5IGRhcmsgaW4gbGlnaHRcbiAgICAvLyBtb2RlLCBzYW1lIGRlbGliZXJhdGUgY2hvaWNlIGFzIHRoZSBsYW5kaW5nIHBhZ2UncyB0ZXJtaW5hbCBzdXJmYWNlc1xuICAgIC8vICgudGVybS8uZmlsZS1jYXJkLy5pbnN0YWxsLWJveCkuIGdpdGh1Yi1kYXJrICsgYSBkYXJrIC0tdnAtY29kZS1ibG9jay1iZy5cbiAgICB0aGVtZTogeyBsaWdodDogXCJnaXRodWItZGFya1wiLCBkYXJrOiBcImdpdGh1Yi1kYXJrXCIgfSxcbiAgICBsaW5lTnVtYmVyczogZmFsc2UsXG4gIH0sXG4gIHRoZW1lQ29uZmlnOiB7XG4gICAgc2l0ZVRpdGxlOiBcIlJlcG9PU1wiLFxuICAgIGxvZ286IFwiL2Zhdmljb24uc3ZnXCIsXG4gICAgbmF2OiBbXG4gICAgICB7IHRleHQ6IFwiR2V0IHN0YXJ0ZWRcIiwgbGluazogXCIvZ2V0dGluZy1zdGFydGVkXCIgfSxcbiAgICAgIHsgdGV4dDogXCJBZ2VudHNcIiwgbGluazogXCIvYWdlbnRzXCIgfSxcbiAgICAgIHsgdGV4dDogXCJDTElcIiwgbGluazogXCIvY2xpXCIgfSxcbiAgICAgIHsgdGV4dDogXCJDb25maWd1cmF0aW9uXCIsIGxpbms6IFwiL2NvbmZpZ3VyYXRpb25cIiB9LFxuICAgICAgeyB0ZXh0OiBcIkVudmlyb25tZW50ICYgc2VjcmV0c1wiLCBsaW5rOiBcIi9lbnZpcm9ubWVudC1hbmQtc2VjcmV0c1wiIH0sXG4gICAgICB7IHRleHQ6IFwicmVwb29zLm9yZ1wiLCBsaW5rOiBcImh0dHBzOi8vcmVwb29zLm9yZ1wiIH0sXG4gICAgXSxcbiAgICAvLyBIYW5kLWN1cmF0ZWQgKFZpdGVQcmVzcyBkb2VzIG5vdCBnZW5lcmF0ZSB0aGlzIGZyb20gdGhlIGZpbGUgdHJlZSkuXG4gICAgLy8gQSBuZXcgcGFnZSBtdXN0IGJlIGFkZGVkIGhlcmUgb3IgaXQgd29uJ3QgYXBwZWFyIGluIG5hdmlnYXRpb24sIGV2ZW5cbiAgICAvLyB0aG91Z2ggaXQgc3RpbGwgYnVpbGRzIGFuZCBpcyByZWFjaGFibGUgYnkgZGlyZWN0IFVSTC5cbiAgICBzaWRlYmFyOiBbXG4gICAgICB7XG4gICAgICAgIHRleHQ6IFwiR2V0dGluZyBzdGFydGVkXCIsXG4gICAgICAgIGl0ZW1zOiBbXG4gICAgICAgICAgeyB0ZXh0OiBcIkluc3RhbGwgYW5kIGZpcnN0IHRhc2tcIiwgbGluazogXCIvZ2V0dGluZy1zdGFydGVkXCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiQ29uY2VwdHNcIiwgbGluazogXCIvY29uY2VwdHNcIiB9LFxuICAgICAgICAgIHsgdGV4dDogXCJBZGRpbmcgUmVwb09TIHRvIGFuIGV4aXN0aW5nIHJlcG9cIiwgbGluazogXCIvZXhpc3RpbmctcmVwb1wiIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0ZXh0OiBcIlVzaW5nIFJlcG9PU1wiLFxuICAgICAgICBpdGVtczogW1xuICAgICAgICAgIHsgdGV4dDogXCJBZ2VudHNcIiwgbGluazogXCIvYWdlbnRzXCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiQnVpbHQtaW4gYWdlbnRzXCIsIGxpbms6IFwiL2J1aWx0LWluLWFnZW50c1wiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIkNvZGluZyBoYXJuZXNzIGNvbXBhdGliaWxpdHlcIiwgbGluazogXCIvY29kaW5nLWhhcm5lc3MtY29tcGF0aWJpbGl0eVwiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIlJldmlldyBhbmQgY2xvc2Utb3V0XCIsIGxpbms6IFwiL3Jldmlldy1hbmQtY2xvc2Utb3V0XCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiQ2hlY2tzIGJlZm9yZSBtZXJnZVwiLCBsaW5rOiBcIi9jaGVja1wiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIlR1bm5lbHNcIiwgbGluazogXCIvdHVubmVsc1wiIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICAge1xuICAgICAgICB0ZXh0OiBcIlJlZmVyZW5jZVwiLFxuICAgICAgICBpdGVtczogW1xuICAgICAgICAgIHsgdGV4dDogXCJDTElcIiwgbGluazogXCIvY2xpXCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiQ29uZmlndXJhdGlvblwiLCBsaW5rOiBcIi9jb25maWd1cmF0aW9uXCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiRW52aXJvbm1lbnQgYW5kIHNlY3JldHNcIiwgbGluazogXCIvZW52aXJvbm1lbnQtYW5kLXNlY3JldHNcIiB9LFxuICAgICAgICAgIHsgdGV4dDogXCJBdXRoZW50aWNhdGlvblwiLCBsaW5rOiBcIi9hdXRoZW50aWNhdGlvblwiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIk5hdGl2ZSBhdXRoZW50aWNhdGlvblwiLCBsaW5rOiBcIi9uYXRpdmUtYXV0aFwiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIlRlbGVncmFtXCIsIGxpbms6IFwiL3RlbGVncmFtXCIgfSxcbiAgICAgICAgICB7IHRleHQ6IFwiRGVwbG95bWVudHMgYW5kIHJlbGVhc2VzXCIsIGxpbms6IFwiL2RlcGxveW1lbnRzLWFuZC1yZWxlYXNlc1wiIH0sXG4gICAgICAgICAgeyB0ZXh0OiBcIkNoYW5nZWxvZ1wiLCBsaW5rOiBcIi9jaGFuZ2Vsb2dcIiB9LFxuICAgICAgICBdLFxuICAgICAgfSxcbiAgICAgIHtcbiAgICAgICAgdGV4dDogXCJBcHBzXCIsXG4gICAgICAgIGl0ZW1zOiBbeyB0ZXh0OiBcIlJlcG9PUyBIdWIgZm9yIE1hY1wiLCBsaW5rOiBcIi9tYWNvcy1odWJcIiB9XSxcbiAgICAgIH0sXG4gICAgICB7XG4gICAgICAgIHRleHQ6IFwiSGVscFwiLFxuICAgICAgICBpdGVtczogW3sgdGV4dDogXCJUcm91Ymxlc2hvb3RpbmdcIiwgbGluazogXCIvdHJvdWJsZXNob290aW5nXCIgfV0sXG4gICAgICB9LFxuICAgIF0sXG4gICAgc29jaWFsTGlua3M6IFtcbiAgICAgIC8vIGFyaWEtbGFiZWwgZG91YmxlcyBhcyB0aGUgdmlzaWJsZSBsYWJlbCBvZiB0aGUgR2l0SHViIHJvdyBpbiB0aGVcbiAgICAgIC8vIG1vYmlsZSBuYXYgc2NyZWVuIChzZWUgYCNWUE5hdlNjcmVlbiAuc29jaWFsLWxpbmtzYCBpbiB0aGVtZS9jdXN0b20uY3NzKS5cbiAgICAgIHsgaWNvbjogXCJnaXRodWJcIiwgbGluazogXCJodHRwczovL2dpdGh1Yi5jb20vcmVwby1vcy9yZXBvb3NcIiwgYXJpYUxhYmVsOiBcIkdpdEh1YlwiIH0sXG4gICAgXSxcbiAgICBzZWFyY2g6IHsgcHJvdmlkZXI6IFwibG9jYWxcIiB9LFxuICAgIG91dGxpbmU6IHsgbGV2ZWw6IFsyLCAzXSwgbGFiZWw6IFwiT24gdGhpcyBwYWdlXCIgfSxcbiAgICBsYXN0VXBkYXRlZDogeyB0ZXh0OiBcIlVwZGF0ZWRcIiB9LFxuICAgIGVkaXRMaW5rOiB7XG4gICAgICBwYXR0ZXJuOiBcImh0dHBzOi8vZ2l0aHViLmNvbS9yZXBvLW9zL3JlcG9vcy9lZGl0L21haW4vdXNlci1kb2NzLzpwYXRoXCIsXG4gICAgICB0ZXh0OiBcIkVkaXQgdGhpcyBwYWdlIG9uIEdpdEh1YlwiLFxuICAgIH0sXG4gICAgZm9vdGVyOiB7XG4gICAgICBtZXNzYWdlOlxuICAgICAgICBcIkZTTC0xLjEtTUlUIFx1MjAxNCBmcmVlIHRvIHVzZSwgc2VsZi1ob3N0IGFuZCBtb2RpZnk7IGNvbnZlcnRzIHRvIE1JVCB0d28geWVhcnMgYWZ0ZXIgcmVsZWFzZS5cIixcbiAgICAgIGNvcHlyaWdodDogXCJDb3B5cmlnaHQgXHUwMEE5IDIwMjYgUmVwb09TIGNvbnRyaWJ1dG9yc1wiLFxuICAgIH0sXG4gIH0sXG59KTtcbiIsICJjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZGlybmFtZSA9IFwiL1VzZXJzL25pY2svY29kZS9uaWNrL3JlcG9vcy13b3JrdHJlZXMvZmVhdC9hZGQtYW5kLWRlbGV0ZS1ldmlkZW5jZS1zaG90cy1mcm9tLXRoZS10L3VzZXItZG9jcy8udml0ZXByZXNzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvbmljay9jb2RlL25pY2svcmVwb29zLXdvcmt0cmVlcy9mZWF0L2FkZC1hbmQtZGVsZXRlLWV2aWRlbmNlLXNob3RzLWZyb20tdGhlLXQvdXNlci1kb2NzLy52aXRlcHJlc3Mvdml0ZS1wbHVnaW4tdGhlbWUtYm9vdC50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvbmljay9jb2RlL25pY2svcmVwb29zLXdvcmt0cmVlcy9mZWF0L2FkZC1hbmQtZGVsZXRlLWV2aWRlbmNlLXNob3RzLWZyb20tdGhlLXQvdXNlci1kb2NzLy52aXRlcHJlc3Mvdml0ZS1wbHVnaW4tdGhlbWUtYm9vdC50c1wiO2ltcG9ydCB7IGJ1aWxkU3luYyB9IGZyb20gXCJlc2J1aWxkXCI7XG5pbXBvcnQgdHlwZSB7IFBsdWdpbiB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSBcIm5vZGU6dXJsXCI7XG5cbmNvbnN0IGJvb3RFbnRyeSA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTChcIi4vdGhlbWUvdGhlbWUtYm9vdC50c1wiLCBpbXBvcnQubWV0YS51cmwpKTtcbmNvbnN0IE1BUktFUiA9ICdpZD1cInJlcG9vcy10aGVtZS1ib290XCInO1xuXG5mdW5jdGlvbiBidW5kbGVUaGVtZUJvb3QoKTogc3RyaW5nIHtcbiAgY29uc3QgcmVzdWx0ID0gYnVpbGRTeW5jKHtcbiAgICBlbnRyeVBvaW50czogW2Jvb3RFbnRyeV0sXG4gICAgYnVuZGxlOiB0cnVlLFxuICAgIHdyaXRlOiBmYWxzZSxcbiAgICBmb3JtYXQ6IFwiaWlmZVwiLFxuICAgIHBsYXRmb3JtOiBcImJyb3dzZXJcIixcbiAgICB0YXJnZXQ6IFwiZXMyMDIwXCIsXG4gICAgbWluaWZ5OiB0cnVlLFxuICB9KTtcbiAgcmV0dXJuIHJlc3VsdC5vdXRwdXRGaWxlc1swXSEudGV4dDtcbn1cblxubGV0IGNhY2hlZEJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuLyoqIElubGluZSBJSUZFIGZvciBjb25maWcgYGhlYWRgIFx1MjAxNCBWaXRlUHJlc3MgU1NHIGRvZXMgbm90IHJ1biB0cmFuc2Zvcm1JbmRleEh0bWwgb24gb3V0cHV0IHBhZ2VzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRoZW1lQm9vdFNjcmlwdENvbnRlbnQoKTogc3RyaW5nIHtcbiAgY2FjaGVkQm9vdCA/Pz0gYnVuZGxlVGhlbWVCb290KCk7XG4gIHJldHVybiBjYWNoZWRCb290O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdGhlbWVCb290UGx1Z2luKCk6IFBsdWdpbiB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogXCJyZXBvb3MtZG9jcy10aGVtZS1ib290XCIsXG4gICAgdHJhbnNmb3JtSW5kZXhIdG1sOiB7XG4gICAgICBvcmRlcjogXCJwcmVcIixcbiAgICAgIGhhbmRsZXIoaHRtbCkge1xuICAgICAgICBjb25zdCBjb2RlID0gdGhlbWVCb290U2NyaXB0Q29udGVudCgpO1xuICAgICAgICBjb25zdCBzY3JpcHRUYWcgPSBgPHNjcmlwdCAke01BUktFUn0+JHtjb2RlfTwvc2NyaXB0PmA7XG4gICAgICAgIGlmIChodG1sLmluY2x1ZGVzKE1BUktFUikpIHtcbiAgICAgICAgICByZXR1cm4gaHRtbC5yZXBsYWNlKG5ldyBSZWdFeHAoYDxzY3JpcHQgJHtNQVJLRVJ9PltcXFxcc1xcXFxTXSo/PC9zY3JpcHQ+YCwgXCJtXCIpLCBzY3JpcHRUYWcpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBodG1sLnJlcGxhY2UoXCI8aGVhZD5cIiwgYDxoZWFkPlxcbiAgICAke3NjcmlwdFRhZ31gKTtcbiAgICAgIH0sXG4gICAgfSxcbiAgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBcWUsU0FBUyxvQkFBb0I7OztBQ0FDLFNBQVMsaUJBQWlCO0FBRTdoQixTQUFTLHFCQUFxQjtBQUZ1UyxJQUFNLDJDQUEyQztBQUl0WCxJQUFNLFlBQVksY0FBYyxJQUFJLElBQUkseUJBQXlCLHdDQUFlLENBQUM7QUFDakYsSUFBTSxTQUFTO0FBRWYsU0FBUyxrQkFBMEI7QUFDakMsUUFBTSxTQUFTLFVBQVU7QUFBQSxJQUN2QixhQUFhLENBQUMsU0FBUztBQUFBLElBQ3ZCLFFBQVE7QUFBQSxJQUNSLE9BQU87QUFBQSxJQUNQLFFBQVE7QUFBQSxJQUNSLFVBQVU7QUFBQSxJQUNWLFFBQVE7QUFBQSxJQUNSLFFBQVE7QUFBQSxFQUNWLENBQUM7QUFDRCxTQUFPLE9BQU8sWUFBWSxDQUFDLEVBQUc7QUFDaEM7QUFFQSxJQUFJO0FBR0csU0FBUyx5QkFBaUM7QUFDL0MsaUJBQWUsZ0JBQWdCO0FBQy9CLFNBQU87QUFDVDtBQUVPLFNBQVMsa0JBQTBCO0FBQ3hDLFNBQU87QUFBQSxJQUNMLE1BQU07QUFBQSxJQUNOLG9CQUFvQjtBQUFBLE1BQ2xCLE9BQU87QUFBQSxNQUNQLFFBQVEsTUFBTTtBQUNaLGNBQU0sT0FBTyx1QkFBdUI7QUFDcEMsY0FBTSxZQUFZLFdB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
