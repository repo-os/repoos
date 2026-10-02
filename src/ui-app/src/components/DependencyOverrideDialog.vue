<script setup lang="ts">
import Button from "./ui/button.vue";
import Dialog from "./ui/dialog/root.vue";
import DialogClose from "./ui/dialog/close.vue";
import DialogContent from "./ui/dialog/content.vue";
import DialogDescription from "./ui/dialog/description.vue";
import DialogOverlay from "./ui/dialog/overlay.vue";
import DialogTitle from "./ui/dialog/title.vue";
import {
  dependencyBlockerLabel,
  dependencyOverrideBlockers,
  resolveDependencyOverride,
} from "../lib/task-dependencies";
</script>

<template>
  <Teleport to="body">
    <Dialog
      :open="dependencyOverrideBlockers !== null"
      @update:open="
        (open) => {
          if (!open) resolveDependencyOverride(false);
        }
      "
    >
      <DialogOverlay />
      <DialogContent class="cc-modal">
        <div class="cc-modal-head">
          <DialogTitle>Start blocked task?</DialogTitle>
          <DialogClose class="close-x" aria-label="Close" @click="resolveDependencyOverride(false)">
            <span aria-hidden="true">×</span>
          </DialogClose>
        </div>
        <DialogDescription class="cc-modal-desc">
          This task has unmet prerequisites.
        </DialogDescription>
        <div class="cc-modal-body">
          <p v-for="blocker in dependencyOverrideBlockers ?? []" :key="blocker.id">
            <strong>{{ dependencyBlockerLabel(blocker) }}</strong>
          </p>
          <p>Starting now may give the engineer a branch without those changes.</p>
        </div>
        <div class="cc-modal-actions">
          <Button variant="outline" @click="resolveDependencyOverride(false)">Cancel</Button>
          <Button variant="accent" @click="resolveDependencyOverride(true)">Start anyway</Button>
        </div>
      </DialogContent>
    </Dialog>
  </Teleport>
</template>
