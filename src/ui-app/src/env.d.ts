/// <reference types="vite/client" />

declare const __REPOOS_COPY_INSPECTOR__: boolean;

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
