<script setup lang="ts">
import type { Input } from "../../../core/input.js";
import Button from "./ui/button.vue";
import { ArrowRight } from "lucide-vue-next";

const props = defineProps<{
  input: Input;
  inputLabel: string;
  nextStatus: Input["status"] | null;
}>();

const emit = defineEmits<{
  open: [];
  moveNext: [];
}>();
</script>

<template>
  <article
    class="task-card group flex shrink-0 cursor-pointer flex-col overflow-hidden rounded-[13px] border border-border bg-[var(--panel)] text-foreground transition duration-150 hover:-translate-y-0.5 hover:border-[var(--border-bright)]"
    tabindex="0"
    @click="emit('open')"
    @keyup.enter="emit('open')"
  >
    <div class="flex flex-1 flex-col p-[13px]">
      <div class="flex items-center gap-[7px]">
        <span class="font-mono text-[10px] text-[var(--txt-faint)]">{{ inputLabel }}</span>
        <span
          v-if="input.type"
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          >{{ input.type }}</span
        >
      </div>
      <h3 class="mt-[11px] line-clamp-2 text-[13px] font-semibold leading-[1.4]">
        {{ input.title }}
      </h3>
      <div class="mt-[11px] flex flex-wrap gap-[6px]">
        <span
          v-if="input.area"
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          >{{ input.area }}</span
        >
        <span
          v-if="input.attachments.length"
          class="rounded-md border border-border bg-[var(--chip-bg)] px-2 py-[2px] font-mono text-[9.5px] text-[var(--txt-dim)]"
          >{{ input.attachments.length }} file{{ input.attachments.length === 1 ? "" : "s" }}</span
        >
      </div>
    </div>
    <div v-if="nextStatus" class="tc-foot tc-actions !ml-0 w-full">
      <Button
        variant="outline"
        class="move-next h-auto w-full justify-center rounded-none border-0 border-t border-border"
        @click.stop="emit('moveNext')"
      >
        <ArrowRight class="size-3.5" /><span
          class="state-dot"
          :class="'state-' + nextStatus"
        ></span>
        Move to {{ nextStatus }}
      </Button>
    </div>
  </article>
</template>

<style scoped>
.state-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
}
.state-new {
  color: var(--cyan);
}
.state-reviewing {
  color: #ffb454;
}
.state-processed {
  color: #4ef0a8;
}
</style>
