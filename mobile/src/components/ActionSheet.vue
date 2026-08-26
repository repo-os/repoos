<template>
  <div v-if="isOpen" class="action-sheet-overlay" @click="closeSheet">
    <div class="action-sheet" @click.stop>
      <div class="action-sheet-header">
        <h3>More Options</h3>
      </div>
      <div class="action-sheet-content">
        <button 
          v-for="item in items" 
          :key="item.id"
          class="action-sheet-item"
          @click="selectItem(item)"
        >
          {{ item.label }}
        </button>
      </div>
      <div class="action-sheet-footer">
        <button class="action-sheet-cancel" @click="closeSheet">Cancel</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface ActionSheetItem {
  id: string;
  label: string;
  action: () => void;
}

const props = defineProps<{
  items: ActionSheetItem[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const isOpen = ref(true);

const closeSheet = () => {
  isOpen.value = false;
  emit('close');
};

const selectItem = (item: ActionSheetItem) => {
  item.action();
  closeSheet();
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
  z-index: 2000;
}

.action-sheet {
  background: var(--panel-solid, #0e1426);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.action-sheet-header {
  padding: 16px;
  text-align: center;
  border-bottom: 1px solid var(--border, rgba(120, 140, 200, 0.14));
}

.action-sheet-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--txt, #e7ecf7);
}

.action-sheet-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.action-sheet-item {
  width: 100%;
  text-align: left;
  padding: 16px 20px;
  border: none;
  background: none;
  color: var(--txt, #e7ecf7);
  font-size: 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border, rgba(120, 140, 200, 0.14));
}

.action-sheet-item:last-child {
  border-bottom: none;
}

.action-sheet-item:hover {
  background: var(--panel, rgba(17, 23, 41, 0.6));
}

.action-sheet-footer {
  padding: 8px;
  border-top: 1px solid var(--border, rgba(120, 140, 200, 0.14));
}

.action-sheet-cancel {
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: var(--panel, rgba(17, 23, 41, 0.6));
  color: var(--txt, #e7ecf7);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.action-sheet-cancel:hover {
  background: var(--nav-hover-bg, rgba(120, 140, 200, 0.07));
}
</style>