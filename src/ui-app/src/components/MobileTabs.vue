<script setup lang="ts">
import { computed } from "vue";
import { navFor } from "../nav";
import { useConfigStore } from "../stores/config";

const config = useConfigStore();
const nav = computed(() =>
  navFor((config.data?.release as { enabled?: unknown } | undefined)?.enabled === true),
);
</script>

<template>
  <div class="tabbar">
    <RouterLink
      v-for="n in nav"
      :key="n.id"
      :to="n.path"
      class="tab"
      active-class="active"
      exact-active-class="active"
    >
      <span v-html="n.icon"></span><span>{{ n.label }}</span>
    </RouterLink>
  </div>
</template>
