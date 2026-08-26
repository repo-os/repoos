import { createRouter, createWebHistory } from 'vue-router';
import ConnectedShell from '../views/ConnectedShell.vue';
import WorkView from '../../../src/ui-app/src/views/WorkView.vue';
import ContextView from '../../../src/ui-app/src/views/ContextView.vue';
import SettingsView from '../../../src/ui-app/src/views/SettingsView.vue';
import AgentsView from '../../../src/ui-app/src/views/AgentsView.vue';
import DashboardView from '../../../src/ui-app/src/views/DashboardView.vue';

const routes = [
  {
    path: '/',
    component: ConnectedShell,
    children: [
      {
        path: '',
        name: 'work',
        component: WorkView
      },
      {
        path: 'work',
        name: 'work',
        component: WorkView
      },
      {
        path: 'search',
        name: 'search',
        component: DashboardView // Using dashboard as search placeholder
      },
      {
        path: 'agents',
        name: 'agents',
        component: AgentsView
      },
      {
        path: 'context',
        name: 'context',
        component: ContextView
      },
      {
        path: 'activity',
        name: 'activity',
        component: DashboardView // Using dashboard as activity placeholder
      },
      {
        path: 'settings',
        name: 'settings',
        component: SettingsView
      }
    ]
  }
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});