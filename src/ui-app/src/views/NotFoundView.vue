<script setup lang="ts">
import { useRoute } from "vue-router";
import RouteNotice from "../components/RouteNotice.vue";

// Catch-all for any path the app does not serve. Shown inside the normal
// app shell so the nav stays available, with a way back to the work queue.
const route = useRoute();
</script>

<template>
  <div class="route-not-found" data-testid="route-not-found">
    <RouteNotice
      title="This page doesn't exist"
      :message="`Nothing is at ${route.fullPath}. The link may be mistyped, or the page may have moved.`"
    >
      <router-link class="route-notice-link" to="/work">Go to Work</router-link>
      <router-link class="route-notice-link route-notice-link-quiet" to="/">Dashboard</router-link>
    </RouteNotice>
  </div>
</template>
