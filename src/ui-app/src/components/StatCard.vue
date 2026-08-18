<script setup lang="ts">
import Card from "./ui/card.vue";

defineProps<{
  label: string;
  value: string | number;
  glow?: boolean;
  color?: string;
  bg?: string;
}>();
</script>

<template>
  <Card class="stat" :class="{ 'glow-cyan': glow }">
    <div class="stat-top">
      <div class="stat-ico" :style="bg ? { background: bg, color: color } : {}">
        <slot></slot>
      </div>
    </div>
    <div class="stat-val" :style="color ? { color } : {}">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
  </Card>
</template>
