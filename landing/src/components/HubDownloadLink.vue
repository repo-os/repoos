<script setup lang="ts">
import { onMounted, ref } from "vue";

const version = ref<string | null>(null);
onMounted(async () => {
  try {
    const response = await fetch("/downloads/version.json", { cache: "no-store" });
    if (!response.ok) return;
    const data: unknown = await response.json();
    if (
      data &&
      typeof data === "object" &&
      "versionName" in data &&
      typeof data.versionName === "string"
    ) {
      version.value = data.versionName;
    }
  } catch {
    // No published APK is the ordinary empty state.
  }
});
</script>

<template>
  <a
    v-if="version"
    href="https://repoos.org/downloads/repoos-hub.apk"
    class="text-[var(--cyan)] hover:underline"
  >
    Download for Android v{{ version }} &rarr;
  </a>
  <span v-else class="text-[var(--txt-faint)]">Coming soon</span>
</template>
