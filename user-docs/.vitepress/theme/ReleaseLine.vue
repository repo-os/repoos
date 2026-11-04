<script setup lang="ts">
import { CURRENT_RELEASE_URL, releaseStamp } from "../../../shared/release";

const stamp = releaseStamp();
</script>

<template>
  <p class="release-line">
    <span class="release-line__dot" aria-hidden="true"></span>
    Current release <strong>{{ stamp }}</strong>
    <a :href="CURRENT_RELEASE_URL">release notes</a>
  </p>
</template>

<style scoped>
.release-line {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
  margin: 1.5rem 0 0;
  padding: 0.45rem 0.85rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 999px;
  background: var(--vp-c-bg-alt);
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.release-line strong {
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.release-line__dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: var(--vp-c-brand-1);
}

.release-line a {
  color: var(--vp-c-brand-1);
  text-decoration: none;
}

.release-line a:hover {
  text-decoration: underline;
}
</style>
