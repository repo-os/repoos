<script setup lang="ts">
import { ref } from "vue";
import { useModalFocus } from "../modal-focus";

// Only the fields the dialog shows. Typed structurally rather than importing
// DevUpdateManifest, so the root type check (which includes the UI tests) does
// not pull in dev-updates.ts and its @capacitor imports.
defineProps<{
  update: { commit: string; notes: string[] };
}>();

const emit = defineEmits<{
  download: [];
  later: [];
}>();

// The dialog is mounted only while an update is pending, so it is always
// active. Escape counts as "Later" (snooze), the same as the button.
const panelEl = ref<HTMLElement | null>(null);
const { onKeydown } = useModalFocus({
  active: () => true,
  panel: panelEl,
  onEscape: () => emit("later"),
});
</script>

<template>
  <Teleport to="body">
    <div
      class="update-backdrop"
      role="presentation"
      data-overlay-layer="floating"
      @keydown="onKeydown"
    >
      <section
        ref="panelEl"
        class="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-update-title"
        tabindex="-1"
      >
        <h2 id="dev-update-title">A new dev build is available</h2>
        <p>Commit {{ update.commit.slice(0, 7) }}</p>
        <ul v-if="update.notes.length">
          <li v-for="note in update.notes" :key="note">{{ note }}</li>
        </ul>
        <div class="update-actions">
          <button type="button" class="btn-primary" @click="emit('download')">Download now</button>
          <button type="button" class="btn-ghost" @click="emit('later')">Later</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
