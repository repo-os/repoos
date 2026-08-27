<template>
  <div v-if="isOpen" class="action-sheet-overlay" @click="handleDismiss">
    <div class="action-sheet-container" @click.stop>
      <div class="action-sheet-header">
        <h3>More Options</h3>
      </div>
      <div class="action-sheet-content">
        <button 
          v-for="item in items" 
          :key="item.id"
          class="action-sheet-button"
          @click="handleItemClick(item)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="action-sheet-footer">
        <button class="action-sheet-cancel" @click="handleClose">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  items: Array<{ id: string; label: string; action: () => void }>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isOpen = ref(true);

const handleItemClick = (item: { id: string; label: string; action: () => void }) => {
  item.action();
  handleClose();
};

const handleClose = () => {
  isOpen.value = false;
  emit('close');
};

const handleDismiss = () => {
  handleClose();
};
</script>

<style scoped>
.action-sheet-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.action-sheet-container {
  background: var(--ion-background-color, #ffffff);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 500px;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
}

.action-sheet-header {
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.action-sheet-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ion-text-color, #000000);
}

.action-sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.action-sheet-button {
  width: 100%;
  text-align: left;
  padding: 16px 20px;
  border: none;
  background: none;
  color: var(--ion-text-color, #000000);
  font-size: 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--ion-border-color, #e0e0e0);
}

.action-sheet-button:last-child {
  border-bottom: none;
}

.action-sheet-button:hover {
  background: var(--ion-background-color-step-100, #f5f5f5);
}

.action-sheet-footer {
  padding: 8px;
  border-top: 1px solid var(--ion-border-color, #e0e0e0);
}

.action-sheet-cancel {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: var(--ion-background-color-step-50, #f0f0f0);
  color: var(--ion-text-color, #000000);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.action-sheet-cancel:hover {
  background: var(--ion-background-color-step-100, #e0e0e0);
}
</style>