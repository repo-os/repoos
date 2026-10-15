<script setup lang="ts">
import Checkbox from "./ui/checkbox.vue";
import {
  CTO_ACTION_LABELS,
  CTO_ACTION_SETTING_DESCRIPTIONS,
  CTO_KILL_HUNG_VALIDATION_WARNING,
  CTO_SAFE_ACTION_IDS,
  type CtoSafeActionId,
} from "../../../core/cto-actions.js";

const props = defineProps<{
  modelValue: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string[]] }>();

function isChecked(id: CtoSafeActionId): boolean {
  return props.modelValue.includes(id);
}

function toggle(id: CtoSafeActionId, checked: boolean): void {
  const next = new Set(props.modelValue);
  if (checked) next.add(id);
  else next.delete(id);
  const ordered = CTO_SAFE_ACTION_IDS.filter((actionId) => next.has(actionId));
  emit("update:modelValue", ordered);
}
</script>

<template>
  <div class="cto-safe-actions" role="group" aria-label="CTO safe actions">
    <p class="cto-safe-actions-note">
      With every action off, the list is empty and the CTO stays report-only.
    </p>
    <label v-for="id in CTO_SAFE_ACTION_IDS" :key="id" class="cto-safe-action-option">
      <Checkbox
        :checked="isChecked(id)"
        :disabled="disabled"
        @update:checked="(v) => toggle(id, v === true)"
      />
      <span class="cto-safe-action-copy">
        <span class="cto-safe-action-label">{{ CTO_ACTION_LABELS[id] }}</span>
        <small class="cto-safe-action-desc">{{ CTO_ACTION_SETTING_DESCRIPTIONS[id] }}</small>
        <small
          v-if="id === 'kill-hung-validation'"
          class="cto-safe-action-warning ff-notice"
          role="note"
        >
          {{ CTO_KILL_HUNG_VALIDATION_WARNING }}
        </small>
      </span>
    </label>
  </div>
</template>

<style scoped>
.cto-safe-actions {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 36rem;
}

.cto-safe-actions-note {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--txt-muted);
}

.cto-safe-action-option {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  cursor: pointer;
}

.cto-safe-action-option + .cto-safe-action-option {
  border-top: 1px solid var(--border);
}

.cto-safe-action-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.cto-safe-action-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
}

.cto-safe-action-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--txt-muted);
}

.cto-safe-action-warning {
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.45;
}
</style>
