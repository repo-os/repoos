import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import ThemePicker from "./ThemePicker.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "nav-bar-content-after": () => h(ThemePicker, { variant: "bar" }),
      "nav-screen-content-after": () => h(ThemePicker, { variant: "screen" }),
    });
  },
};
