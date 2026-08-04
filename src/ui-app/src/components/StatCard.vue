<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  glow?: boolean;
  color?: string;
  bg?: string;
}>();
</script>

<template>
  <div class="glass stat" :class="{ 'glow-cyan': glow }">
    <div class="stat-top">
      <div class="stat-ico" :style="bg ? { background: bg, color: color } : {}">
        <slot></slot>
      </div>
    </div>
    <div class="stat-val" :style="color ? { color } : {}">{{ value }}</div>
    <div class="stat-label">{{ label }}</div>
  </div>
</template>
