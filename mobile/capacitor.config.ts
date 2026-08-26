import type { CapacitorConfig } from "@capacitor/cli";

/**
 * RepoOS mobile hub — Capacitor config.
 *
 * The native shell's own UI (server picker + lock screen) is served from
 * `webDir: www` and runs with full Capacitor bridge access. Server content is
 * NOT loaded into this WebView — it is opened via @capacitor/inappbrowser's
 * `openInWebView`, which runs untrusted content in an isolated WebView
 * (separate Android process / isolated iOS storage) with NO Capacitor bridge,
 * so a joined server can never call privileged native APIs. See
 * docs/mobile-architecture.md.
 */
const config: CapacitorConfig = {
  appId: "org.repoos.mobile",
  appName: "RepoOS",
  webDir: "www",
  server: {
    androidScheme: "https",
    iosScheme: "capacitor",
  },
  ios: {
    contentInset: "automatic",
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
