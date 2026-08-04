<script setup lang="ts">
import { NAV } from "../nav";
</script>

<template>
  <div class="tabbar">
    <RouterLink
      v-for="n in NAV"
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
