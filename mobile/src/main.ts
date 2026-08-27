import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import { router } from './router';
import { IonicVue } from '@ionic/vue';
import '@ionic/vue/css/ionic.bundle.css';

const app = createApp(App);
app.use(IonicVue);
app.use(router);
app.mount("#app");
