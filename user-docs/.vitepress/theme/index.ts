import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import AgentPromptCta from "./AgentPromptCta.vue";
import NavBarLogo from "./NavBarLogo.vue";
import ThemePicker from "./ThemePicker.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // The header mark is an inline, token-coloured SVG instead of the static
      // square favicon, so it follows the theme like the landing nav (#0862).
      // Geometry is shared via shared/logo.ts; `logo:` in config.mts is gone.
      "nav-bar-title-before": () => h(NavBarLogo),
      "nav-bar-content-after": () => h(ThemePicker, { variant: "bar" }),
      "nav-screen-content-after": () => h(ThemePicker, { variant: "screen" }),
    });
  },
  enhanceApp({ app }) {
    // Registered globally so the docs homepage (layout: home, plain Markdown)
    // can mount the same prompt call to action the landing page uses.
    app.component("AgentPromptCta", AgentPromptCta);
  },
};
