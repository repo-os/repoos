<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";

defineProps<{
  mode: "add" | "edit";
  name: string;
  url: string;
  busy: boolean;
  validating: boolean;
  error: string;
  platform: "ios" | "android" | "web";
}>();

const emit = defineEmits<{
  back: [];
  submit: [];
  delete: [];
  "update:name": [v: string];
  "update:url": [v: string];
}>();
</script>

<template>
  <div class="form-view" data-testid="hub-add-server-form">
    <header class="subhead" :class="{ 'is-ios': platform === 'ios' }">
      <button type="button" class="back-btn" @click="emit('back')">
        <ChevronLeft :size="22" />
        <span>Servers</span>
      </button>
      <h1 class="subhead-title">{{ mode === "add" ? "Add server" : "Edit server" }}</h1>
    </header>

    <div class="form-scroll">
      <label class="field">
        <span class="field-label">Display name</span>
        <input
          :value="name"
          type="text"
          placeholder="dev"
          autocomplete="off"
          enterkeyhint="done"
          @input="emit('update:name', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="field">
        <span class="field-label">Server URL (HTTPS)</span>
        <input
          :value="url"
          type="url"
          placeholder="https://dev.repoos.org"
          inputmode="url"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
          :readonly="mode === 'edit'"
          enterkeyhint="go"
          @input="emit('update:url', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <p v-if="error" class="form-error">{{ error }}</p>
      <p v-if="mode === 'edit'" class="hint">
        URL can't be changed here — delete and re-add to point elsewhere.
      </p>

      <div class="form-actions">
        <button
          v-if="mode === 'edit'"
          type="button"
          class="btn-ghost danger"
          data-testid="hub-delete-server"
          @click="emit('delete')"
        >
          Delete server
        </button>
        <span class="spacer" />
        <button type="button" class="btn-ghost" @click="emit('back')">Cancel</button>
        <button
          type="button"
          class="btn-primary"
          :disabled="busy"
          data-testid="hub-save-server"
          @click="emit('submit')"
        >
          {{ validating ? "Checking…" : mode === "add" ? "Save" : "Done" }}
        </button>
      </div>
    </div>
  </div>
</template>
