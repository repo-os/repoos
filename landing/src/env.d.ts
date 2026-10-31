// vue-tsc resolves `.vue` SFCs through its language plugin. This declaration
// keeps `import App from "./App.vue"` valid when that plugin does not attach
// (the landing merge-gate failure TS2307). Vite still compiles the SFCs.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}
