<script setup lang="ts">
// A plain-language "this link doesn't lead anywhere" card: a title, one line
// of explanation, and the way back (passed in through the default slot).
defineProps<{ title: string; message: string }>();
</script>

<template>
  <section class="route-notice" role="status">
    <div class="route-notice-copy">
      <h2>{{ title }}</h2>
      <p>{{ message }}</p>
    </div>
    <div class="route-notice-actions">
      <slot />
    </div>
  </section>
</template>
